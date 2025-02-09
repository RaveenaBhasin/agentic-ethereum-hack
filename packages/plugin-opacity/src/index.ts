import {
    type IVerifiableInferenceAdapter,
    type VerifiableInferenceOptions,
    type VerifiableInferenceResult,
    VerifiableInferenceProvider,
    ModelProviderName,
    models,
    elizaLogger,
} from "@elizaos/core";
import { verifyProof } from "./utils/api";
import { EigenDAClient } from "@elizaos/plugin-eigenda";

interface OpacityOptions {
    modelProvider?: ModelProviderName;
    token?: string;
    teamId?: string;
    teamName?: string;
    opacityProverUrl: string;
    // EigenDA options
    eigenDAPrivateKey?: string;
    eigenDAApiUrl?: string;
    eigenDARpcUrl?: string;
    eigenDACreditsContractAddress?: string;
}

export class OpacityAdapter implements IVerifiableInferenceAdapter {
    public options: OpacityOptions;
    private eigenDAClient: InstanceType<typeof EigenDAClient>;
    private eigenDAIdentifier: Uint8Array;

    constructor(options: OpacityOptions) {
        this.options = options;

        // Initialize EigenDA client if private key is provided
        if (options.eigenDAPrivateKey) {
            this.eigenDAClient = new EigenDAClient({
                privateKey: options.eigenDAPrivateKey,
                apiUrl: options.eigenDAApiUrl,
                rpcUrl: options.eigenDARpcUrl,
                creditsContractAddress: options.eigenDACreditsContractAddress
            });
        }
    }

    private async initializeEigenDA() {
        if (!this.eigenDAClient) {
            throw new Error("EigenDA client not initialized - missing private key");
        }

        if (!this.eigenDAIdentifier) {
            // Get or create identifier
            const identifiers = await this.eigenDAClient.getIdentifiers();
            this.eigenDAIdentifier = identifiers.length > 0
                ? identifiers[0]
                : await this.eigenDAClient.createIdentifier();

            // Check balance and top up if needed
            const balance = await this.eigenDAClient.getBalance(this.eigenDAIdentifier);
            if (balance < 0.001) {
                elizaLogger.log("EigenDA balance low, topping up with 0.01 ETH...");
                await this.eigenDAClient.topupCredits(this.eigenDAIdentifier, 0.01);
            }
        }
    }

    //Support anthropic
    async generateTextY(
        context: string,
        modelClass: string,
        options?: VerifiableInferenceOptions
    ): Promise<VerifiableInferenceResult> {
        const provider = this.options.modelProvider || ModelProviderName.ANTHROPIC;
        const baseEndpoint = options?.endpoint || `https://gateway.ai.cloudflare.com/v1/${this.options.teamId}/${this.options.teamName}`;
        const model = models[provider].model[modelClass];
        const apiKey = this.options.token;

        elizaLogger.log("Generating text with options:", {
            modelProvider: provider,
            model: modelClass,
        });

        let endpoint: string;
        const requestHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            ...options?.headers,
        };

        switch (provider) {
            case ModelProviderName.OPENAI:
                endpoint = `${baseEndpoint}/openai/chat/completions`;
                requestHeaders["Authorization"] = `Bearer ${apiKey}`;
                break;
            case ModelProviderName.ANTHROPIC:
                endpoint = `${baseEndpoint}/anthropic/v1/messages`;
                requestHeaders["x-api-key"] = apiKey;
                requestHeaders["anthropic-version"] = "2023-06-01";
                break;
            default:
                throw new Error(`Unsupported model provider: ${provider}`);
        }
        console.log("Endpoint", endpoint);
        try {

            let body: Record<string, unknown>;
            if (provider === ModelProviderName.ANTHROPIC) {
                body = {
                    model: model.name,
                    system: context, // ? Use `system` as a top-level parameter
                    messages: [{ role: "user", content: context }], // ? OpenAI format remains unchanged
                    temperature: model.temperature || 0.7,
                    max_tokens: model.maxOutputTokens,
                };
            } else {
                body = {
                    model: model.name,
                    messages: [{ role: "system", content: context }], // ? OpenAI format remains unchanged
                    temperature: model.temperature || 0.7,
                    max_tokens: model.maxOutputTokens,
                };
            }

            elizaLogger.debug("Request body:", JSON.stringify(body, null, 2));
            const requestBody = JSON.stringify(body);

            elizaLogger.debug("Making request to provider with:", {
                endpoint,
                headers: { ...requestHeaders, "Authorization": "[REDACTED]" },
                body: requestBody,
            });

            // Validate JSON before sending
            try {
                JSON.parse(requestBody);
            } catch {
                elizaLogger.error("Invalid JSON body:", body);
                throw new Error("Failed to create valid JSON request body");
            }

            const response = await fetch(endpoint, {
                method: "POST",
                headers: requestHeaders,
                body: requestBody,
            });
            console.log("Response", response);
            console.log("stringify Response", JSON.stringify(response));

            if (!response.ok) {
                const errorText = await response.text();
                elizaLogger.error("API error response:", {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText,
                });
                throw new Error(`API request failed: ${errorText}`);
            }

            elizaLogger.debug("API response:", {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                type: response.type,
                url: response.url,
            });

            const responseJson = await response.json();
            elizaLogger.info(responseJson);
            const text = responseJson.choices?.[0]?.message?.content ?? "";
            elizaLogger.info("printing log id");
            elizaLogger.info(response.headers.get("cf-aig-log-id"));
            return {
                text,
                id: response.headers.get("cf-aig-log-id") || "",
                provider: VerifiableInferenceProvider.OPACITY,
                timestamp: Date.now(),
                proof: await this.generateProof(this.options.opacityProverUrl, response.headers.get("cf-aig-log-id")),
            };
        } catch (error) {
            console.error("Error in Opacity generateText:", error);
            throw error;
        }
    }

    async generateText(
        context: string,
        modelClass: string,
        options?: VerifiableInferenceOptions
    ): Promise<VerifiableInferenceResult> {
        const provider = this.options.modelProvider || ModelProviderName.OPENAI || ModelProviderName.ANTHROPIC;
        const baseEndpoint =
            options?.endpoint || `https://gateway.ai.cloudflare.com/v1/${this.options.teamId}/${this.options.teamName}`;
        const model = models[provider].model[modelClass];
        const apiKey = this.options.token;

        elizaLogger.log("Generating text with options:", {
            modelProvider: provider,
            model: modelClass,
        });

        // Get provider-specific endpoint
        let endpoint: string;
        let authHeader: string;
        const requestHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            ...options?.headers
        };

        switch (provider) {
            case ModelProviderName.OPENAI:
                endpoint = `${baseEndpoint}/openai/chat/completions`;
                authHeader = `Bearer ${apiKey}`;
                break;
            default:
                throw new Error(`Unsupported model provider: ${provider} `);
        }

        try {
            let body: Record<string, unknown>;
            // Handle different API formats
            switch (provider) {
                case ModelProviderName.OPENAI:
                    body = {
                        model: model.name,
                        messages: [
                            {
                                role: "system",
                                content: context,
                            },
                        ],
                        temperature: model.temperature || 0.7,
                        max_tokens: model.maxOutputTokens,
                        frequency_penalty: model.frequency_penalty,
                        presence_penalty: model.presence_penalty,
                    };
                    break;
                default:
                    throw new Error(`Unsupported model provider: ${provider} `);
            }

            elizaLogger.debug("Request body:", JSON.stringify(body, null, 2));
            const requestBody = JSON.stringify(body);
            const requestHeaders = {
                "Content-Type": "application/json",
                Authorization: authHeader,
                ...options?.headers,
            };

            elizaLogger.debug("Making request to Cloudflare with:", {
                endpoint,
                headers: {
                    ...requestHeaders,
                    Authorization: "[REDACTED]",
                },
                body: requestBody,
            });

            // Validate JSON before sending
            try {
                JSON.parse(requestBody); // Verify the JSON is valid
            } catch {
                elizaLogger.error("Invalid JSON body:", body);
                throw new Error("Failed to create valid JSON request body");
            }
            elizaLogger.debug("Request body:", requestBody);
            const cloudflareResponse = await fetch(endpoint, {
                method: "POST",
                headers: requestHeaders,
                body: requestBody,
            });

            if (!cloudflareResponse.ok) {
                const errorText = await cloudflareResponse.text();
                elizaLogger.error("Cloudflare error response:", {
                    status: cloudflareResponse.status,
                    statusText: cloudflareResponse.statusText,
                    error: errorText,
                });
                throw new Error(`Cloudflare request failed: ${errorText} `);
            }

            elizaLogger.debug("Cloudflare response:", {
                status: cloudflareResponse.status,
                statusText: cloudflareResponse.statusText,
                headers: cloudflareResponse.headers,
                type: cloudflareResponse.type,
                url: cloudflareResponse.url,
            });

            const cloudflareLogId =
                cloudflareResponse.headers.get("cf-aig-log-id");
            const cloudflareResponseJson = await cloudflareResponse.json();

            const proof = await this.generateProof(
                this.options.opacityProverUrl,
                cloudflareLogId
            );

            elizaLogger.debug(
                "Proof generated for text generation ID:",
                cloudflareLogId
            );

            // // Extract text based on provider format
            const text = cloudflareResponseJson.choices[0].message.content;
            const timestamp = Date.now();
            return {
                text: text,
                id: cloudflareLogId,
                provider: VerifiableInferenceProvider.OPACITY,
                timestamp: timestamp,
                proof: proof,
            };
        } catch (error) {
            console.error("Error in Opacity generateText:", error);
            throw error;
        }
    }

    async generateProof(baseUrl: string, logId: string) {
        const response = await fetch(`${baseUrl}/api/logs/${logId}`);
        elizaLogger.info("Fetching proof for log ID:", logId);
        if (!response.ok) {
            throw new Error(`Failed to fetch proof: ${response.statusText} `);
        }
        const proof = await response.json();

        // Store proof in EigenDA if client is initialized
        if (this.eigenDAClient) {
            try {
                await this.initializeEigenDA();

                // Store proof with metadata
                const proofData = JSON.stringify({
                    proof,
                    logId,
                    timestamp: Date.now()
                });

                const uploadResult = await this.eigenDAClient.upload(proofData, this.eigenDAIdentifier);
                elizaLogger.debug("Proof stored in EigenDA with job ID:", uploadResult.job_id);

                // Return proof with EigenDA reference
                return {
                    ...proof,
                    eigenDAJobId: uploadResult.job_id
                };
            } catch (error) {
                elizaLogger.error("Failed to store proof in EigenDA:", error);
                // Return original proof if EigenDA storage fails
                return proof;
            }
        }

        return proof;
    }

    async verifyProof(result: VerifiableInferenceResult): Promise<boolean> {
        const isValid = await verifyProof(
            `${this.options.opacityProverUrl}`,
            result.id,
            result.proof
        );
        elizaLogger.log("Proof verified:", isValid.success);
        if (!isValid.success) {
            throw new Error("Proof is invalid");
        }
        return isValid.success;
    }
}

export default OpacityAdapter;
