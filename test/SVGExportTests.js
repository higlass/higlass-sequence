import { expect } from "chai";
import register from "higlass-register";

import FetchMockHelper from "./utils/FetchMockHelper";

import { HiGlassComponent, getTrackObjectFromHGC } from "higlass";

import {
  waitForDataLoaded,
  mountHGComponent,
  removeHGComponent,
} from "./utils/test-helpers";

import viewConf from "./view-configs/simple-track";

import SequenceTrack from "../src/scripts/SequenceTrack";

register({
  name: "SequenceTrack",
  track: SequenceTrack,
  config: SequenceTrack.config,
});

describe("SVG export", () => {
  const fetchMockHelper = new FetchMockHelper("", "SVGExport");

  beforeAll(async () => {
    await fetchMockHelper.activateFetchMock();
  });

  describe("SVG export", () => {
    let hgc = null;
    let div = null;

    beforeAll((done) => {
      [div, hgc] = mountHGComponent(div, hgc, viewConf, done);
    });

    it("tests that the export works and contains the correct data", (done) => {
      hgc.instance().handleExportSVG();

      const trackObj = getTrackObjectFromHGC(
        hgc.instance(),
        viewConf.views[0].uid,
        viewConf.views[0].tracks.top[1].uid
      );

      const tile = trackObj.visibleAndFetchedTiles()[0];
      const svgData = tile.svgData;

      expect(svgData.letter[15]).to.equal("N");
      expect(svgData.letter[16]).to.equal("T");
      expect(svgData.barColors[15]).to.equal("#800080");
      expect(svgData.barColors[16]).to.equal("#e8e500");

      done();
    });

    afterAll(() => {
      removeHGComponent(div);
    });
  });

  afterAll(async () => {
    await fetchMockHelper.storeDataAndResetFetchMock();
  });
});
