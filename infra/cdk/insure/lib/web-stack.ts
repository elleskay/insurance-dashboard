import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { NextjsServerless } from "./constructs/NextjsServerless";

// Default to the conventional `apps/web` location. Override via PLATFORM_DEMO_APP_PATH
// so platform CI can point at `apps/_demo` for self-test without rewriting this file.
const APP_REL = process.env.PLATFORM_DEMO_APP_PATH ?? "apps/web";

export class WebStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new NextjsServerless(this, "Web", {
      appPath: path.resolve(__dirname, "..", "..", "..", "..", APP_REL),
      environment: {
        DATABASE_URL: process.env.DATABASE_URL ?? "",
        AUTH_SECRET: process.env.AUTH_SECRET ?? "",
        AUTH_URL: process.env.AUTH_URL ?? "",
        // Policy checker (apps/insure /api/check). Baked at synth time, so the
        // key must be in the environment when you run cdk deploy. Without it the
        // route returns 503 and the checker is unavailable.
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
        CHECKER_MODEL: process.env.CHECKER_MODEL ?? "",
      },
      // Optional: provide a custom domain so AUTH_URL is known up front.
      // customDomain: {
      //   domainName: "armoury.example.com",
      //   certificateArn: "arn:aws:acm:us-east-1:...",
      //   hostedZoneId: "Z123ABCDE",
      // },
    });
  }
}
