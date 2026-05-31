import type { OpenNextConfig } from "@opennextjs/aws/types/open-next";

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: "aws-lambda-streaming",
      converter: "aws-apigw-v2",
    },
  },
  imageOptimization: {},
};

export default config;
