import { Plugin } from "@elizaos/core";
import { aaveProtocolAction } from "./actions/findData.ts";

export const defiPlugin: Plugin = {
    name: "Defi Plugin",
    description: "Defi Plugin for Eliza",
    actions: [aaveProtocolAction],
    evaluators: [],
    providers: [],
};

export default defiPlugin;
