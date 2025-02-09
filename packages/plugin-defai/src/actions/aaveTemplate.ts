export const aaveTemplate = `Using the provided context and wallet information:

{{recentMessages}}

Extract the following details for the Aave protocol interaction:
- **Network**: The blockchain network to query (ethereum, polygon, avalanche)
- **Action Type**: The type of action (supply, borrow, lending APR, borrowing APR)
- **Asset**: The specific token symbol to check (default: all assets)

If a value is not explicitly provided, use the default specified above.

Respond with a JSON object containing only the extracted information:

\`json
{
    "network": string,
    "actionType": string,
    "asset": string | null,
}
\`
`;