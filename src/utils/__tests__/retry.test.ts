import { describe, expect, it, vi } from "vitest";
import { retry } from "../async";

describe("retry", () => {
  it("ripete fino a maxAttempts e poi risolve", async () => {
    let calls = 0;
    const onRetry = vi.fn();

    const result = await retry(
      async () => {
        calls += 1;
        if (calls < 2) throw new Error("boom");
        return "ok";
      },
      2,
      1,
      onRetry
    );

    expect(result).toBe("ok");
    expect(calls).toBe(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][1]).toBe(1);
  });

  it("non riprova quando maxAttempts è 1", async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls += 1;
          throw new Error("fail");
        },
        1,
        1
      )
    ).rejects.toThrow("fail");
    expect(calls).toBe(1);
  });
});

