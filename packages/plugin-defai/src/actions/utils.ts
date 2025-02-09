import { ethers } from "ethers";
import { erc20Abi } from "viem";

export async function handleLendingApr(poolContract: ethers.Contract, asset: string | null, provider, chain) {
    const reserves = await poolContract.getReservesList();
    let bestApr = 0;
    let bestAsset = null;
    let bestSymbol = "";
    for (const tokenAddress of reserves) {
        const tokenContract = new ethers.Contract(
            tokenAddress,
            erc20Abi,
            provider
        );
        let symbol: any;
        try {
            symbol = await tokenContract.symbol();
        } catch {
            try {
                symbol = await tokenContract.name();
            } catch {
                continue;
            }
        }
        if (asset && asset.toLowerCase() !== symbol.toLowerCase()) continue;

        const reserveData = await poolContract.getReserveData(tokenAddress);
        const apr = Number(reserveData.currentLiquidityRate) / 1e27 * 100;

        if (apr > bestApr) {
            bestApr = apr;
            bestAsset = tokenAddress;
            bestSymbol = symbol;
        }
    }

    const responseMessage = asset
        ? `Current APR for ${asset} on ${chain}: ${bestApr.toFixed(2)}%`
        : `Best lending APR on ${chain} is ${bestApr.toFixed(2)}% for ${bestSymbol}`;

    // console.log("best asset", bestAsset);
    // console.log("best apr", bestApr);
    // console.log("best symbol", bestSymbol);
    return responseMessage;
}

export async function handleBorrowApr(poolContract: ethers.Contract, asset: string | null, provider, chain) {
    const reserves = await poolContract.getReservesList();
    console.log("Reserves", reserves);

    let bestApr = 0; 
    let bestAsset = null;
    let bestSymbol = "";

    for (const tokenAddress of reserves) {
        // console.log("Token address", tokenAddress);
    
        const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
        let symbol: string;
        try {
            symbol = await tokenContract.symbol();
        } catch {
            try {
                symbol = await tokenContract.name();
            } catch {
                continue;
            }
        }
        if (asset && asset.toLowerCase() !== symbol.toLowerCase()) continue;

        // console.log("Symbol", symbol);
        const reserveData = await poolContract.getReserveData(tokenAddress);
        // console.log("Reserve data", reserveData);

        const variableRate = Number(reserveData.currentVariableBorrowRate) / 1e27 * 100;
        // console.log("Variable rate", variableRate);
        const stableRate = Number(reserveData.currentStableBorrowRate) / 1e27 * 100;
        // console.log("Stable rate", stableRate);

        const apr = stableRate > 0 ? Math.max(variableRate, stableRate) : variableRate;

        if (apr > bestApr) {
            bestApr = apr;
            bestAsset = tokenAddress;
            bestSymbol = symbol;
        }
    }

    const responseMessage = asset
        ? `Current Borrow APR for ${asset} on ${chain}: ${bestApr.toFixed(2)}%`
        : `Best Borrowing APR on ${chain} is ${bestApr.toFixed(2)}% for ${bestSymbol}`;

    return responseMessage;
}
