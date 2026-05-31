#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { WebStack } from "../lib/web-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "ap-southeast-1",
};

// Rename this stack id to match your app (e.g. "ArmouryServerless").
// The id becomes the CloudFormation stack name.
new WebStack(app, "InsureServerless", { env });
