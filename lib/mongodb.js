
import { MongoClient } from "mongodb";

const uri =
  typeof globalThis.process !== "undefined" ? globalThis.process.env?.MONGODB_URI : undefined;

let client;
let clientPromise;

if (!globalThis._mongoClientPromise) {
  if (!uri) {
    globalThis._mongoClientPromise = Promise.reject(
      new Error("MONGODB_URI is not defined"),
    );
  } else {
    client = new MongoClient(uri);
    globalThis._mongoClientPromise = client.connect();
  }
}

clientPromise = globalThis._mongoClientPromise;

export default clientPromise;
