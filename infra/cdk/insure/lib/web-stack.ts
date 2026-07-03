import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { NextjsServerless } from "./constructs/NextjsServerless";

// The app this stack deploys. CoverLens has no database or auth, so the only
// runtime env vars are the checker key, model, and the origin allow-list.
const APP_REL = "apps/insure";

export class WebStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new NextjsServerless(this, "Web", {
      appPath: path.resolve(__dirname, "..", "..", "..", "..", APP_REL),
      environment: {
        // Same-origin guard for /api/check. When set, only these origins may
        // call the paid checker route; unset, the guard is off (local dev).
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? "",
        // Policy checker (apps/insure /api/check). Baked at synth time, so the
        // key must be in the environment when you run cdk deploy. Without it the
        // route returns 503 and the checker is unavailable.
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
        CHECKER_MODEL: process.env.CHECKER_MODEL ?? "",
      },
      // Custom domain on the CloudFront distribution. DNS lives on Vercel
      // (soonkeong.dev): a CNAME points coverlens.soonkeong.dev at the
      // distribution.
      customDomain: {
        domainName: "coverlens.soonkeong.dev",
        certificateArn:
          "arn:aws:acm:us-east-1:281639842383:certificate/35d18d9e-1dc9-4626-8293-8a70fb580e3b",
      },
    });
  }
}
