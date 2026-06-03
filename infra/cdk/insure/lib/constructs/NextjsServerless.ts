import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

export interface CustomDomainProps {
  /** Fully-qualified domain (e.g. `armoury.example.com`). */
  readonly domainName: string;
  /**
   * ACM certificate ARN in `us-east-1` (CloudFront requirement).
   * Must already exist and cover the domain (SAN or wildcard).
   */
  readonly certificateArn: string;
  /**
   * Optional. If provided, an A/AAAA alias record is created in this zone
   * pointing at the CloudFront distribution. Skip if your DNS is elsewhere.
   */
  readonly hostedZoneId?: string;
  /** Optional. Required only if `hostedZoneId` is set. */
  readonly hostedZoneName?: string;
}

export interface NextjsServerlessProps {
  /**
   * Absolute or stack-relative path to the Next.js app directory.
   * The `.open-next/` build output must exist under this path.
   */
  readonly appPath: string;

  /**
   * Environment variables to set on the server Lambda.
   * Critical ones to always include:
   *  - DATABASE_URL
   *  - AUTH_SECRET
   *  - AUTH_URL: set this to the canonical public URL (custom domain or
   *    CloudFront). If you omit it, NextAuth falls back to the Lambda
   *    Function URL, which breaks redirects and cookies behind CloudFront.
   */
  readonly environment: Record<string, string>;

  /**
   * Memory size for the server Lambda. Default 1024.
   */
  readonly serverMemoryMb?: number;

  /**
   * Timeout (seconds) for the server Lambda and the CloudFront origin read.
   * Default 60. Raise for routes that run slow work (e.g. multi-pass LLM calls).
   */
  readonly serverTimeoutSeconds?: number;

  /**
   * CloudFront price class. Default PRICE_CLASS_200 (NA, EU, AP).
   */
  readonly priceClass?: cloudfront.PriceClass;

  /**
   * Cache policy for the default behavior (the HTML/RSC responses served by the
   * server Lambda). Defaults to CACHING_DISABLED, the safe choice for auth/SSR
   * apps because it never caches a personalized response. The downside: every
   * request, including Next.js link prefetches and repeat visits, hits the
   * Lambda. That is wasteful for static/SSG-heavy apps and can trip the Lambda
   * account concurrency limit under modest traffic (ConcurrentInvocationLimitExceeded).
   *
   * For a content/SSG app, pass a policy with minTtl 0 that honours the origin
   * Cache-Control headers Next.js already sets, so cacheable pages cache at the
   * edge while dynamic routes (which Next marks no-store) stay uncached:
   *
   *   const respectOrigin = new cloudfront.CachePolicy(this, "RespectOrigin", {
   *     minTtl: cdk.Duration.seconds(0),
   *     defaultTtl: cdk.Duration.seconds(0),
   *     maxTtl: cdk.Duration.days(365),
   *     enableAcceptEncodingBrotli: true,
   *     enableAcceptEncodingGzip: true,
   *   });
   *   new NextjsServerless(this, "Web", { appPath, environment, defaultCachePolicy: respectOrigin });
   */
  readonly defaultCachePolicy?: cloudfront.ICachePolicy;

  /**
   * Log retention for the Lambda log groups. Default 14 days.
   */
  readonly logRetention?: logs.RetentionDays;

  /**
   * Custom domain configuration. When set, the construct provisions
   * CloudFront with this domain as an alias and (optionally) creates a
   * Route 53 alias record. Skips the two-pass deploy problem because
   * AUTH_URL is known up front.
   */
  readonly customDomain?: CustomDomainProps;

  /**
   * Preserve CloudFormation logical IDs for in-place upgrades of an
   * existing deploy that previously created resources at the stack root
   * (without this construct). Maps "ServerFunction" | "ImageFunction"
   * | "AssetsBucket" | "Distribution" to the original stack-level
   * logical IDs. Setting these avoids a destroy+recreate (and a URL
   * change for CloudFront).
   *
   * Example for adopting this construct on a stack that previously had
   * a top-level `new lambda.Function(this, "ServerFunction"...)`:
   *
   *   logicalIdOverrides: {
   *     serverFunction: "ServerFunction6F3D7051",
   *     imageFunction: "ImageFunctionE28774B0",
   *     assetsBucket: "AssetsBucket5CB76180",
   *     distribution: "Distribution830FAC52",
   *   }
   *
   * Find the existing IDs in the CloudFormation template (Resources)
   * before the refactor. CDK appends a short hash to your construct
   * id; the override skips that.
   */
  readonly logicalIdOverrides?: {
    serverFunction?: string;
    imageFunction?: string;
    assetsBucket?: string;
    distribution?: string;
  };
}

/**
 * Deploys a Next.js app (built with OpenNext) as Lambda + S3 + CloudFront.
 *
 * Encodes the gotchas you'd otherwise have to learn in production:
 *  - Server Actions allowed-origins must include the CloudFront domain
 *    AND the Lambda Function URL host. The app must read ALLOWED_ORIGINS
 *    at build time. Pass `ALLOWED_ORIGINS=*.cloudfront.net,*.lambda-url.<region>.on.aws`
 *    for first deploy (wildcards work), or set explicit hosts after.
 *  - AUTH_URL must point to the canonical public URL, not the Lambda URL.
 *    If you provide `customDomain`, set environment.AUTH_URL = `https://${customDomain.domainName}`.
 *  - Server-side `signOut()` does not reliably clear cookies on this
 *    deploy path. Use a client component that calls signOut from
 *    next-auth/react. The apps/_template/components/SignOutButton.tsx
 *    in the platform template shows the right pattern.
 *  - The image-optimization function fails to install its deps on
 *    Windows due to a path-with-colon mkdtemp issue. Build on
 *    macOS/Linux/WSL, or skip Next.js Image if you must build on Windows.
 *  - CDK env vars are baked at synth time. The construct reads them via
 *    the `environment` prop; set them in the shell that runs `cdk deploy`.
 */
export class NextjsServerless extends Construct {
  public readonly distribution: cloudfront.Distribution;
  public readonly assetsBucket: s3.Bucket;
  public readonly serverFunction: lambda.Function;
  public readonly imageFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: NextjsServerlessProps) {
    super(scope, id);

    const openNextDir = path.join(props.appPath, ".open-next");
    const retention = props.logRetention ?? logs.RetentionDays.TWO_WEEKS;
    const overrides = props.logicalIdOverrides ?? {};

    this.assetsBucket = new s3.Bucket(this, "AssetsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    if (overrides.assetsBucket) {
      (this.assetsBucket.node.defaultChild as cdk.CfnResource).overrideLogicalId(
        overrides.assetsBucket,
      );
    }

    new s3deploy.BucketDeployment(this, "AssetsDeployment", {
      sources: [s3deploy.Source.asset(path.join(openNextDir, "assets"))],
      destinationBucket: this.assetsBucket,
      prune: true,
    });

    const serverLogGroup = new logs.LogGroup(this, "ServerLogGroup", {
      retention,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.serverFunction = new lambda.Function(this, "ServerFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(openNextDir, "server-functions", "default")),
      memorySize: props.serverMemoryMb ?? 1024,
      // The policy checker route runs a multi-pass grounded LLM extraction that
      // can take well over 30s on a multi-page PDF, so give it room (matches the
      // route's maxDuration). Raise the CloudFront readTimeout below to match.
      timeout: cdk.Duration.seconds(props.serverTimeoutSeconds ?? 60),
      architecture: lambda.Architecture.ARM_64,
      environment: {
        NODE_ENV: "production",
        AUTH_TRUST_HOST: "true",
        ...props.environment,
      },
      logGroup: serverLogGroup,
    });
    if (overrides.serverFunction) {
      (this.serverFunction.node.defaultChild as cdk.CfnResource).overrideLogicalId(
        overrides.serverFunction,
      );
    }

    const serverFunctionUrl = this.serverFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
    });

    const imageLogGroup = new logs.LogGroup(this, "ImageLogGroup", {
      retention,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.imageFunction = new lambda.Function(this, "ImageFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(openNextDir, "image-optimization-function")),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(15),
      architecture: lambda.Architecture.ARM_64,
      environment: {
        BUCKET_NAME: this.assetsBucket.bucketName,
        BUCKET_KEY_PREFIX: "",
      },
      logGroup: imageLogGroup,
    });
    if (overrides.imageFunction) {
      (this.imageFunction.node.defaultChild as cdk.CfnResource).overrideLogicalId(
        overrides.imageFunction,
      );
    }

    this.assetsBucket.grantRead(this.imageFunction);

    const imageFunctionUrl = this.imageFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    const requestForwardAll = cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER;

    const distributionProps: cloudfront.DistributionProps = {
      defaultBehavior: {
        origin: new origins.FunctionUrlOrigin(serverFunctionUrl, {
          // Match the server Lambda timeout so a slow checker response is not
          // cut off at the CDN before the function finishes.
          readTimeout: cdk.Duration.seconds(props.serverTimeoutSeconds ?? 60),
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy:
          props.defaultCachePolicy ?? cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: requestForwardAll,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      additionalBehaviors: {
        "/_next/static/*": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.assetsBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        "/_next/image*": {
          origin: new origins.FunctionUrlOrigin(imageFunctionUrl),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          originRequestPolicy: requestForwardAll,
        },
        "/favicon.ico": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.assetsBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
      priceClass: props.priceClass ?? cloudfront.PriceClass.PRICE_CLASS_200,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      ...(props.customDomain
        ? {
            domainNames: [props.customDomain.domainName],
            certificate: acm.Certificate.fromCertificateArn(
              this,
              "Certificate",
              props.customDomain.certificateArn,
            ),
          }
        : {}),
    };

    this.distribution = new cloudfront.Distribution(this, "Distribution", distributionProps);
    if (overrides.distribution) {
      (this.distribution.node.defaultChild as cdk.CfnResource).overrideLogicalId(
        overrides.distribution,
      );
    }

    if (props.customDomain?.hostedZoneId && props.customDomain.hostedZoneName) {
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
        hostedZoneId: props.customDomain.hostedZoneId,
        zoneName: props.customDomain.hostedZoneName,
      });
      new route53.ARecord(this, "AliasA", {
        zone,
        recordName: props.customDomain.domainName,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
      });
      new route53.AaaaRecord(this, "AliasAAAA", {
        zone,
        recordName: props.customDomain.domainName,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
      });
    }

    this.serverFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:DeleteObject"],
        resources: [this.assetsBucket.bucketArn, `${this.assetsBucket.bucketArn}/*`],
      }),
    );

    const publicUrl = props.customDomain
      ? `https://${props.customDomain.domainName}`
      : `https://${this.distribution.distributionDomainName}`;

    new cdk.CfnOutput(cdk.Stack.of(this), `${id}DistributionUrl`, {
      value: publicUrl,
      description: "Public URL",
    });

    new cdk.CfnOutput(cdk.Stack.of(this), `${id}CloudFrontDomain`, {
      value: this.distribution.distributionDomainName,
      description: "CloudFront distribution domain (raw, even if custom domain set)",
    });

    new cdk.CfnOutput(cdk.Stack.of(this), `${id}LambdaUrlHost`, {
      value: cdk.Fn.select(2, cdk.Fn.split("/", serverFunctionUrl.url)),
      description:
        "Lambda Function URL host. Add this to ALLOWED_ORIGINS at the next build so Server Actions accept forwarded-host.",
    });
  }
}
