import { describe, expect, it } from "vitest";
import { describeOp, opLetter, opToken, txnColor, txnInkColor, txnTextColor } from "@/lib/utils";

describe("txnColor", () => {
  it("gives each of the three transactions its own token", () => {
    expect(txnColor(1)).toBe("var(--color-t1)");
    expect(txnColor(2)).toBe("var(--color-t2)");
    expect(txnColor(3)).toBe("var(--color-t3)");
  });

  it("wraps at three because the palette holds three", () => {
    expect(txnColor(4)).toBe(txnColor(1));
    expect(txnColor(5)).toBe(txnColor(2));
    expect(txnColor(6)).toBe(txnColor(3));
  });

  it("text tokens track the fill tokens", () => {
    expect(txnTextColor(1)).toBe("var(--color-t1-text)");
    expect(txnTextColor(4)).toBe(txnTextColor(1));
  });
});

describe("txnInkColor", () => {
  // measured: white on jade is 3.15 and fails AA, white on iris is 5.37
  it("only T1 carries white text", () => {
    expect(txnInkColor(1)).toBe("#ffffff");
    expect(txnInkColor(2)).toBe("#1c2024");
    expect(txnInkColor(3)).toBe("#1c2024");
  });

  it("wraps with the palette", () => {
    expect(txnInkColor(4)).toBe("#ffffff");
    expect(txnInkColor(5)).toBe("#1c2024");
  });
});

describe("opToken", () => {
  it("writes lifecycle operations without a key", () => {
    expect(opToken("begin", 1, null)).toBe("B1");
    expect(opToken("commit", 2, null)).toBe("C2");
    expect(opToken("abort", 3, null)).toBe("A3");
  });

  it("writes data operations with their key", () => {
    expect(opToken("read", 1, "x")).toBe("R1(x)");
    expect(opToken("write", 2, "y")).toBe("W2(y)");
    expect(opToken("insert", 1, "z")).toBe("I1(z)");
    expect(opToken("delete", 2, "z")).toBe("D2(z)");
  });

  it("marks predicate operations with P rather than a key", () => {
    expect(opToken("predicate_read", 1, null)).toBe("R1(P)");
    expect(opToken("predicate_write", 2, null)).toBe("W2(P)");
    expect(opToken("predicate_delete", 3, null)).toBe("D3(P)");
  });

  it("shows a missing key rather than hiding it", () => {
    expect(opToken("read", 1, null)).toBe("R1(?)");
  });

  it("does not invent a letter for an unknown kind", () => {
    expect(opToken("nonsense", 1, "x")).toBe("?1(x)");
  });
});

describe("opLetter", () => {
  // the timeline used to carry its own copy of this table, and the two could drift
  it("gives one letter per kind", () => {
    expect(opLetter("begin")).toBe("B");
    expect(opLetter("commit")).toBe("C");
    expect(opLetter("abort")).toBe("A");
    expect(opLetter("read")).toBe("R");
    expect(opLetter("write")).toBe("W");
    expect(opLetter("insert")).toBe("I");
    expect(opLetter("delete")).toBe("D");
  });

  it("treats a predicate operation as its base kind", () => {
    expect(opLetter("predicate_read")).toBe("R");
    expect(opLetter("predicate_write")).toBe("W");
    expect(opLetter("predicate_delete")).toBe("D");
  });

  it("agrees with the token the same operation renders as", () => {
    for (const kind of ["begin", "commit", "read", "write", "delete"]) {
      expect(opToken(kind, 1, "x").startsWith(opLetter(kind))).toBe(true);
    }
  });

  it("does not invent a letter it does not have", () => {
    expect(opLetter("nonsense")).toBe("?");
  });
});

describe("describeOp", () => {
  it("names each operation in plain words", () => {
    expect(describeOp("begin", null, null, null)).toBe("begin");
    expect(describeOp("read", "1", null, null)).toBe("read 1");
    expect(describeOp("write", "1", 11, null)).toBe("write 1 = 11");
    expect(describeOp("delete", "1", null, null)).toBe("delete 1");
  });

  it("reads a predicate operation as a scan", () => {
    expect(describeOp("predicate_read", null, null, "value > 10")).toBe("scan where value > 10");
    expect(describeOp("predicate_write", null, 5, "value > 10")).toBe(
      "update where value > 10 set 5",
    );
  });

  it("writes a zero value rather than dropping it", () => {
    // `value && ...` would print "write 1 = " here, because 0 is falsy
    expect(describeOp("write", "1", 0, null)).toBe("write 1 = 0");
  });
});
