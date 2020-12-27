import slugid from 'slugid';
import { RemoteFile } from 'generic-filehandle';
import { tsvParseRows } from 'd3-dsv';

class FaiDataFetcher {
  constructor(dataConfig) {
    this.dataConfig = dataConfig;
    this.trackUid = slugid.nice();

    const { IndexedFasta } = require('@gmod/indexedfasta');

    this.chromInfo = null;

    this.chromsizePromise = fetch(dataConfig.chromSizesUrl, {
      cache: 'force-cache',
      method: 'GET',
    })
      .then((response) => response.text())
      .then((chrInfoText) => {
        const data = tsvParseRows(chrInfoText);
        this.chromInfo = this.parseChromsizesRows(data);
      });

    const remoteFA = new RemoteFile(dataConfig.fastaUrl);
    const remoteFAI = new RemoteFile(dataConfig.faiUrl);

    this.sequenceFile = new IndexedFasta({
      fasta: remoteFA,
      fai: remoteFAI,
    });
  }

  tilesetInfo(callback) {
    this.tilesetInfoLoading = true;
    return this.chromsizePromise
      .then(() => {
        this.tilesetInfoLoading = false;

        const TILE_SIZE = 1024;
        const totalLenth = this.chromInfo.totalLength;
        const maxZoom = Math.ceil(
          Math.log(totalLenth / TILE_SIZE) / Math.log(2),
        );

        let retVal = {};

        retVal = {
          tile_size: TILE_SIZE,
          bins_per_dimension: TILE_SIZE,
          max_zoom: maxZoom,
          max_width: TILE_SIZE * 2 ** maxZoom,
          min_pos: [0],
          max_pos: [totalLenth],
          datatype: 'multivec_singleres_sequence'
        };

        if (callback) {
          callback(retVal);
        }

        return retVal;
      })
      .catch((err) => {
        this.tilesetInfoLoading = false;

        if (callback) {
          callback({
            error: `Error parsing chromsizes: ${err}`,
          });
        } else {
          console.error('Could not fetch tileInfo for sequence track.');
        }
      });
  }

  fetchTilesDebounced(receivedTiles, tileIds) {
    const tiles = {};
    const zoomLevels = [];
    const tilePos = [];
    const validTileIds = [];
    const tilePromises = [];

    for (const tileId of tileIds) {
      const parts = tileId.split('.');
      const z = parseInt(parts[0], 10);
      const x = parseInt(parts[1], 10);

      if (Number.isNaN(x) || Number.isNaN(z)) {
        console.warn('Invalid tile zoom or position:', z, x);
        continue;
      }
      zoomLevels.push(z);
      tilePos.push([x]);
      validTileIds.push(tileId);
      tilePromises.push(this.tile(z, x));
    }

    Promise.all(tilePromises).then((values) => {
      for (let i = 0; i < values.length; i++) {
        const validTileId = validTileIds[i];
        tiles[validTileId] = {};
        tiles[validTileId].dense = values[i];
        tiles[validTileId].zoomLevel = zoomLevels[i];
        tiles[validTileId].tilePos = tilePos[i];
        tiles[validTileId].tilePositionId = validTileId;
      }

      receivedTiles(tiles);
    });
    return tiles;
  }

  tile(z, x) {
    return this.tilesetInfo().then((tsInfo) => {
      const tileWidth = +tsInfo.max_width / 2 ** +z;

      // get the bounds of the tile
      let minX = tsInfo.min_pos[0] + x * tileWidth;
      const maxX = tsInfo.min_pos[0] + (x + 1) * tileWidth;

      const recordPromises = [];

      const { chromLengths, cumPositions } = this.chromInfo;

      for (let i = 0; i < cumPositions.length; i++) {
        const chromName = cumPositions[i].chr;
        const chromStart = cumPositions[i].pos;

        const chromEnd = cumPositions[i].pos + chromLengths[chromName];

        if (chromStart <= minX && minX < chromEnd) {
          // start of the visible region is within this chromosome

          if (maxX > chromEnd) {
            // the visible region extends beyond the end of this chromosome
            // fetch from the start until the end of the chromosome
            recordPromises.push(
              this.sequenceFile
                .getSequence(
                  chromName,
                  minX - chromStart,
                  chromEnd - chromStart,
                )
                .then((value) => {
                  return value;
                }),
            );

            // continue onto the next chromosome
            minX = chromEnd;
          } else {
            const endPos = Math.ceil(maxX - chromStart);
            const startPos = Math.floor(minX - chromStart);
            // the end of the region is within this chromosome
            recordPromises.push(
              this.sequenceFile
                .getSequence(chromName, startPos, endPos)
                .then((value) => {
                  return value;
                }),
            );

            // end the loop because we've retrieved the last chromosome
            break;
          }
        }
      }

      return Promise.all(recordPromises).then((values) => {
        const allBases = values.join('');
        return this.convertBasesToMultivec(allBases);
      });
    });
  }

  convertBasesToMultivec(str) {
    const res = [];

    [...str].forEach((c) => {
      if (c === 'A' || c === 'a') {
        res.push([1, 0, 0, 0, 0, 0]);
      } else if (c === 'T' || c === 't') {
        res.push([0, 1, 0, 0, 0, 0]);
      } else if (c === 'G' || c === 'g') {
        res.push([0, 0, 1, 0, 0, 0]);
      } else if (c === 'C' || c === 'c') {
        res.push([0, 0, 0, 1, 0, 0]);
      } else if (c === 'N' || c === 'n') {
        res.push([0, 0, 0, 0, 1, 0]);
      } else {
        res.push([0, 0, 0, 0, 0, 1]);
      }
    });
    return res;
  }

  parseChromsizesRows(data) {
    const cumValues = [];
    const chromLengths = {};
    const chrPositions = {};

    let totalLength = 0;

    for (let i = 0; i < data.length; i++) {
      const length = Number(data[i][1]);
      totalLength += length;

      const newValue = {
        id: i,
        chr: data[i][0],
        pos: totalLength - length,
      };

      cumValues.push(newValue);
      chrPositions[newValue.chr] = newValue;
      chromLengths[data[i][0]] = length;
    }

    return {
      cumPositions: cumValues,
      chrPositions,
      totalLength,
      chromLengths,
    };
  }
}

export default FaiDataFetcher;
