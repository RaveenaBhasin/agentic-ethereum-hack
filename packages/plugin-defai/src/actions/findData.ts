import {
    composeContext,
    elizaLogger,
    generateObjectDeprecated,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    ModelProviderName,
    State
} from "@elizaos/core";
import { aaveTemplate } from "./aaveTemplate.ts";
import { validateRouterNitroConfig } from "../environment.ts";
import { ethers } from "ethers";
import { handleLendingApr, handleBorrowApr } from "./utils.ts";
import { AAVE_V3_POOL_ABI } from "./aaveAbi.ts";
import { getRpcUrlFromChainId } from "./chains.ts";
// import { OpacityAdapter } from "../../../plugin-opacity/src/index.ts";

const NETWORK_CONFIG = {
    ethereum: {
        chainId: 1,
        poolAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2'
    },
    polygon: {
        chainId: 137,
        poolAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
    },
    avalanche: {
        chainId: 43114,
        poolAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
    },
    arbitrum: {
        chainId: 42161,
        poolAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
    }
};


export const aaveProtocolAction = {
    name: "FIND_BEST_APR",
    description: "Finds the best APR pools available on Aave V3 across different networks or for specific assets",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State | undefined,
        _options: { [key: string]: unknown } = {},
        callback?: HandlerCallback
    ): Promise<boolean> => {
        console.log("Starting FIND_BEST_APR handler...");
        elizaLogger.log("Starting FIND_BEST_APR handler...");

        // Initialize or update state
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        const context = composeContext({
            state,
            template: aaveTemplate,
        });

        // let proverUrl = runtime.getSetting("OPACITY_PROVER_URL");
        // let token = runtime.getSetting("ANTHROPIC_API_KEY");
        // const opacityAdapter = new OpacityAdapter({ modelProvider: ModelProviderName.OPENAI, opacityProverUrl: proverUrl as string, token: token });
        // const text = opacityAdapter.generateText(context, "small", { endpoint: "https://api.anthropic.com" as string });
        // const result = await opacityAdapter.generateText(context, "gpt-4o-mini");
        // console.log("text", result.text);
        // console.log("Proof:", result.proof);

        // const isValid = await opacityAdapter.verifyProof(result);
        // console.log("Proof is valid:", isValid);

        const content = await generateObjectDeprecated({
            runtime,
            context: context,
            modelClass: ModelClass.LARGE,
        });
        console.log("content: ", content);
        elizaLogger.log("swap content: ", JSON.stringify(content));

        let { network, actionType, asset } = content;
        asset = content.asset === "all" ? null : content.asset;

        if (!network || !actionType) {
            const errorMessage = "Please specify both network and action type for Aave interaction";
            callback?.({ text: errorMessage });
            return false;
        }

        try {
            const networkConfig = NETWORK_CONFIG[network.toLowerCase()];
            console.log("Network config", networkConfig);
            if (!networkConfig) {
                throw new Error(`Unsupported network: ${network} `);
            }

            let rpc = getRpcUrlFromChainId(networkConfig.chainId);
            console.log("rpc", rpc);
            let provider = new ethers.JsonRpcProvider(rpc);
            const poolContract = new ethers.Contract(networkConfig.poolAddress, AAVE_V3_POOL_ABI, provider);
            console.log("pool contract", poolContract);

            let responseMessage: any = {};

            switch (actionType.toLowerCase()) {
                case "lending apr":
                case "supply apr":
                    responseMessage = await handleLendingApr(poolContract, asset, provider, network);
                    console.log("Response", responseMessage);
                    break;
                case "borrowing apr":
                case "borrow apr":
                    responseMessage = await handleBorrowApr(poolContract, asset, provider, network);
                    console.log("Response", responseMessage);
                    break;
                default:
                    throw new Error(`Unsupported action type: ${actionType} `);
            }

            callback?.({
                text: responseMessage,
            });

            return true;

        } catch (error) {
            elizaLogger.log(`Error during executing swap: ${error.message} `);
            callback?.({ text: `Error during swap:  ${error.message} ` });
            return false;
        }
        return true;
    },
    template: aaveTemplate,
    validate: async (runtime: IAgentRuntime) => {
        await validateRouterNitroConfig(runtime);
        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What's the best lending APR on Aave on Ethereum?",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll check the best lending APR on Ethereum",
                    action: "FIND_BEST_APR",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Best lending APR on Ethereum is 3.45% for USDC",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What's the current lending APR for USDT on Polygon Aave?",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll check the USDT lending APR on Polygon",
                    action: "FIND_BEST_APR",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Current APR for USDT on Polygon: 2.87%",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What's the current borrow APR for USDT on Polygon Aave?",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll check the USDT borrowing APR on Polygon",
                    action: "FIND_BEST_APR",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Current APR for USDT on Polygon: 2.87%",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What's the best borrow apr on polygon Aave?",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll check the USDT borrowing APR on Polygon",
                    action: "FIND_BEST_APR",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Current APR for USDT on Polygon: 2.87%",
                },
            },
        ]
    ],
    similes: ["CHECK_APR", "FIND_APR", "BEST_YIELD", "AAVE_RATES", "LENDING_RATES"],
};

