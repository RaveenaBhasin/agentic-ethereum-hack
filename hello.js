import { EigenDA } from "@jbrower95/eigenblob/dist/da.js";

async function createEigenDAClient() {
    const TEST_URI = "https://disperser-holesky-web.eigenda.xyz:443";
    const client = new EigenDA({uri: TEST_URI});
    const putRequest = client.put({hello: 'world'});
    const blob = await putRequest.wait(10_000 /* max deadline in MS */);
    console.log("Blob", blob);
    const receivedBlob = await client.get(putRequest);
    console.log("Get blob", receivedBlob);
}

createEigenDAClient();