import "./loadEnv.js";
import mongoose from "mongoose";

const cached = globalThis.__mongooseCache || { conn: null, promise: null };
globalThis.__mongooseCache = cached;

async function connectDb() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const env = globalThis.process?.env ?? {};
    const rawUri = env.MONGODB_URI;
    const mongoUri = typeof rawUri === "string" ? rawUri.trim().replace(/;$/, "") : "";
    const rawDbName = env.MONGODB_DB_NAME;
    const dbName = typeof rawDbName === "string" ? rawDbName.trim() : "";

    if (!mongoUri) {
      throw new Error("MONGODB_URI env var not set");
    }

    const connectionOptions = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    };

    if (dbName) {
      connectionOptions.dbName = dbName;
    }

    cached.promise = mongoose
      .connect(mongoUri, connectionOptions)
      .then(() => mongoose.connection)
      .catch((err) => {
        cached.promise = null;
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
}

export default connectDb;
