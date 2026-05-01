import mongoose from "mongoose";

const mongoUri = globalThis.process?.env?.MONGODB_URI;

if (!mongoUri) {
  throw new Error("MONGODB_URI env var not set");
}

const cached = globalThis.__mongooseCache || { conn: null, promise: null };
globalThis.__mongooseCache = cached;

async function connectDb() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(mongoUri, {
        bufferCommands: false,
        maxPoolSize: 1,
        dbName: "blog",
      })
      .then(() => mongoose.connection);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDb;
