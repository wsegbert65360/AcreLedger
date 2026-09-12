import { spawn } from "node:child_process";
import type { CommandResult, CommandRunner } from "./types.js";

export const defaultCommandRunner: CommandRunner = {
  async run(command, args, options) {
    return await new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options?.cwd,
        env: { ...process.env, ...options?.env },
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({ stdout, stderr, code: code ?? 1 });
      });
    });
  },
};

export function assertSuccess(result: CommandResult, context: string): void {
  if (result.code !== 0) {
    throw new Error(`${context} failed with exit ${result.code}`);
  }
}
