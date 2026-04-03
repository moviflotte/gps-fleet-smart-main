// cluster.js — multi-core wrapper for server.js
import cluster from "cluster";
import os from "os";
import dotenv from "dotenv";
dotenv.config();

const WORKERS = Number(process.env.WORKERS || os.cpus().length);

if (cluster.isPrimary) {
  console.log(`[cluster] Primary ${process.pid} starting ${WORKERS} workers`);
  for (let i = 0; i < WORKERS; i++) cluster.fork();
  cluster.on("exit", (worker, code) => {
    console.warn(`[cluster] Worker ${worker.process.pid} exited (code ${code}), restarting…`);
    cluster.fork();
  });
} else {
  await import("./server.js");
}
