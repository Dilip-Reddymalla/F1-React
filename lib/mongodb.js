
import { MongoClient } from "mongodb";

const cached = globalThis._mongoClientCache || { client: null, promise: null };
globalThis._mongoClientCache = cached;

async function connectMongo() {
  if (cached.client) return cached.client;

  if (!cached.promise) {
    const uri =
      typeof globalThis.process !== "undefined"
        ? globalThis.process.env?.MONGODB_URI?.trim().replace(/;$/, "")
        : undefined;

    if (!uri) {
      throw new Error("MONGODB_URI is not defined");
    }

    const client = new MongoClient(uri);
    cached.promise = client.connect().then((connectedClient) => {
      cached.client = connectedClient;
      return connectedClient;
    });
  }

  return cached.promise;
}

export default connectMongo;
