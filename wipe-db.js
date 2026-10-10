// wipe-db.js — Deletes ALL data from the database (all collections).
// Usage: node wipe-db.js
require("dotenv").config();
const mongoose = require("mongoose");

(async () => {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/school_db";
  try {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    console.log("Connected to:", mongoose.connection.host, "/", db.databaseName);

    const collections = await db.listCollections().toArray();
    if (collections.length === 0) {
      console.log("No collections found. Database is already empty.");
    } else {
      for (const coll of collections) {
        const result = await db.collection(coll.name).deleteMany({});
        console.log(`  ✓ Cleared "${coll.name}" — ${result.deletedCount} documents deleted`);
      }
    }

    console.log("\n✅ All data wiped successfully.");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
