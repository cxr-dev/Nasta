import { describe, it, expect } from "vitest";
import { disruptionType } from "./disruptionType";

describe("disruptionType", () => {
  describe("protest", () => {
    it("matches 'protest'", () => {
      expect(disruptionType("Protest vid Slussen")).toBe("protest");
    });

    it("matches 'demonstration'", () => {
      expect(disruptionType("Demonstration pågår")).toBe("protest");
    });

    it("matches 'strejk'", () => {
      expect(disruptionType("Strejk bland förare")).toBe("protest");
    });

    it("matches 'blockad'", () => {
      expect(disruptionType("Blockad vid stationen")).toBe("protest");
    });

    it("does NOT match month name 'March'", () => {
      expect(disruptionType("Avstängd from March 1st")).not.toBe("protest");
    });
  });

  describe("technical", () => {
    it("matches 'signalfel'", () => {
      expect(disruptionType("Signalfel")).toBe("technical");
    });

    it("matches 'tekniskt fel'", () => {
      expect(disruptionType("Tekniskt fel")).toBe("technical");
    });

    it("matches 'spår'", () => {
      expect(disruptionType("Spårarbete")).toBe("technical");
    });

    it("does NOT match 'el' inside 'tunnelbanans'", () => {
      expect(disruptionType("pga tunnelbanans utbyggnad")).not.toBe("technical");
    });

    it("does NOT match 'el' inside 'elektrisk'", () => {
      expect(disruptionType("Elektrisk problem")).not.toBe("technical");
    });

    it("matches standalone 'el' as a word", () => {
      expect(disruptionType("Elfel i spåret")).toBe("technical");
    });
  });

  describe("snow", () => {
    it("matches English 'snow'", () => {
      expect(disruptionType("Snow on the tracks")).toBe("snow");
    });

    it("matches Swedish 'snö'", () => {
      expect(disruptionType("Snö på spåren")).toBe("snow");
    });
  });

  describe("rain", () => {
    it("matches English 'rain'", () => {
      expect(disruptionType("Heavy rain")).toBe("rain");
    });

    it("matches Swedish 'regn'", () => {
      expect(disruptionType("Regn och åska")).toBe("rain");
    });
  });

  describe("storm", () => {
    it("matches 'storm'", () => {
      expect(disruptionType("Storm warning")).toBe("storm");
    });
  });

  describe("wind", () => {
    it("matches 'wind'", () => {
      expect(disruptionType("High winds")).toBe("wind");
    });
  });

  describe("ice", () => {
    it("matches English 'ice' with word boundary", () => {
      expect(disruptionType("Ice on platform")).toBe("ice");
    });

    it("matches English 'icy'", () => {
      expect(disruptionType("Icy conditions")).toBe("ice");
    });

    it("matches Swedish 'isig'", () => {
      expect(disruptionType("Isigt väglag")).toBe("ice");
    });

    it("matches Swedish 'isgata'", () => {
      expect(disruptionType("Isgata vid hållplats")).toBe("ice");
    });

    it("matches Swedish 'ishalka'", () => {
      expect(disruptionType("Ishalka på vägen")).toBe("ice");
    });

    it("matches Swedish 'isbana'", () => {
      expect(disruptionType("Isbana på spåret")).toBe("ice");
    });

    it("matches Swedish 'isar' as word end", () => {
      expect(disruptionType("Isar bildas")).toBe("ice");
    });

    it("does NOT match English verb 'is'", () => {
      expect(disruptionType("The station is closed")).not.toBe("ice");
    });

    it("does NOT match 'ice' inside 'voice'", () => {
      expect(disruptionType("Voice announcement")).not.toBe("ice");
    });

    it("does NOT match 'ice' inside 'service'", () => {
      expect(disruptionType("Customer service")).not.toBe("ice");
    });

    it("does NOT match standalone 'is' in English", () => {
      expect(disruptionType("This is a test message")).not.toBe("ice");
    });
  });

  describe("weather", () => {
    it("matches Swedish 'väder'", () => {
      expect(disruptionType("Väderrelaterad störning")).toBe("weather");
    });
  });

  describe("general", () => {
    it("returns general for unknown messages", () => {
      expect(disruptionType("Planerat banarbete")).toBe("general");
    });

    it("handles empty string", () => {
      expect(disruptionType("")).toBe("general");
    });

    it("returns general for the blue line closure message", () => {
      const msg = "Blå linjen är avstängd mellan T-Centralen och Kungsträdgården från 22/6 t.o.m. 16/8 pga tunnelbanans utbyggnad";
      expect(disruptionType(msg)).toBe("general");
    });

    it("returns general for English blue line closure message", () => {
      const msg = "The blue line is closed between T-Centralen and Kungsträdgården";
      expect(disruptionType(msg)).toBe("general");
    });
  });
});
