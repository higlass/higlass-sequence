import { scaleLinear, scaleOrdinal, schemeCategory10 } from 'd3-scale';
import { color } from 'd3-color';
import FaiDataFetcher from './FaiDataFetcher';

const SequenceTrack = (HGC, ...args) => {
  if (!new.target) {
    throw new Error(
      'Uncaught TypeError: Class constructor cannot be invoked without "new"',
    );
  }

  // Services
  const { tileProxy, pixiRenderer } = HGC.services;

  // Utils
  const { colorToHex } = HGC.utils;

  class SequenceTrackClass extends HGC.tracks.BarTrack {
    constructor(context, options) {
      if (context.dataConfig.type === 'fasta') {
        context.dataFetcher = new FaiDataFetcher(context.dataConfig);
      }

      super(context, options);

      this.dataFetchingMode = context.dataConfig.type;

      this.updateOptions(this.options);
    }

    setPixiTexts() {
      this.pixiTexts = [];
      const letters = ['A', 'T', 'G', 'C', 'N', ' '];
      this.letterWidths = [];
      this.letterHeights = [];
      this.maxLetterWidth = 0;
      this.maxLetterHeight = 0;

      // Initilize the letters only once - this is expensive.
      letters.forEach((letter) => {
        this.pixiTexts[letter] = new HGC.libraries.PIXI.Text(
          letter,
          this.options.textOption,
        );
        this.pixiTexts[letter].updateText();
        // We get sharper edges if we scale down a large letter
        this.letterWidths[letter] =
          this.pixiTexts[letter].getBounds().width / 2;
        this.letterHeights[letter] =
          this.pixiTexts[letter].getBounds().height / 2;
        this.maxLetterWidth = Math.max(
          this.letterWidths[letter],
          this.maxLetterWidth,
        );
        this.maxLetterHeight = Math.max(
          this.letterHeights[letter],
          this.maxLetterHeight,
        );
        this.pixiTexts[letter] = this.pixiTexts[letter].texture;
      });
    }

    isMultivecSingleResSequence() {
      return this.dataFetchingMode === 'fasta' || (this.tilesetInfo && this.tilesetInfo.datatype=='multivec_singleres_sequence'); 
    }

    updateOptions(newOptions) {
      this.options = newOptions;

      // We are ignoring aggregation modes for fasta files.
      if (this.isMultivecSingleResSequence()) {
        this.options.colorAggregationMode = 'none';
      }

      this.options.textOption = {
        fontSize: `${newOptions.fontSize * 2}px`,
        fontFamily: newOptions.fontFamily,
        fill: colorToHex(newOptions.fontColor),
        fontWeight: 'bold',
      };

      this.notificationText = new HGC.libraries.PIXI.Text(
        newOptions.notificationText,
        {
          fontSize: '13px',
          fontFamily: 'Arial',
          fill: 0x333333,
        },
      );
      this.notificationText.anchor.x = 0.5;
      this.notificationText.anchor.y = 0.5;

      this.colorScale = newOptions.colorScale || scaleOrdinal(schemeCategory10);
      this.colorScaleRgb = this.colorScale.map((el) => color(el));
      this.barBorderColor = colorToHex(newOptions.barBorderColor);

      this.localColorToHexScale();
      this.setPixiTexts();
    }

    initTile(tile) {
      this.unFlatten(tile);
      this.createColorAndLetterData(tile);

      tile.texts = [];

      tile.textGraphics = new HGC.libraries.PIXI.Graphics();
      tile.rectGraphics = new HGC.libraries.PIXI.Graphics();
      tile.borderGraphics = new HGC.libraries.PIXI.Graphics();
      tile.tempGraphics = new HGC.libraries.PIXI.Graphics();

      tile.graphics.addChild(tile.rectGraphics);
      tile.graphics.addChild(tile.textGraphics);
      tile.graphics.addChild(tile.borderGraphics);

      // stores which zoomLevel the tile belongs to. Needed for extendedPreloading
      tile.zoomLevel = parseInt(tile.tileId.split('.')[0], 10);

      tile.initialized = true;

      this.renderTile(tile);
    }

    rerender(newOptions, updateOptions = true) {
      const visibleAndFetched = this.visibleAndFetchedTiles();

      if (updateOptions) {
        this.updateOptions(newOptions);
        this.refreshTiles();
        // if color scale has changed we need to reinitialize colors
        for (let i = 0; i < visibleAndFetched.length; i++) {
          this.createColorAndLetterData(visibleAndFetched[i]);
        }
      }

      for (let i = 0; i < visibleAndFetched.length; i++) {
        this.renderTile(visibleAndFetched[i]);
      }
    }

    /** cleanup */
    destroyTile(tile) {
      // We just set the tile to null.
      // Destroying each graphics object lead to some artifacts.
      tile = null;
      // tile.initialized = false;
      // tile.rectGraphics.destroy(true);
      // tile.textGraphics.destroy(true);
      // tile.borderGraphics.destroy(true);
      // tile.texts = [];

      this.rerender(this.options, false);
    }

    zoomed(newXScale, newYScale) {
      this.xScale(newXScale);
      this.yScale(newYScale);
      this.refreshTiles();
      this.rerender(this.options, false);
    }

    hideNotification() {
      // Notification are on the pBorder level.
      const graphics = this.pBorder;
      graphics.clear();
      graphics.removeChildren();
    }

    showNotification() {
      this.drawNotification();
    }

    drawNotification() {
      this.notificationText.x = this.position[0] + this.dimensions[0] / 2;
      this.notificationText.y = this.position[1] + this.dimensions[1] / 2;

      // Draw the notification on the pBorder level. This is in the foreground
      const graphics = this.pBorder;

      graphics.clear();
      graphics.removeChildren();

      graphics.beginFill(0xe0e0e0);

      graphics.drawRect(
        this.position[0],
        this.position[1],
        this.dimensions[0],
        this.dimensions[1],
      );
      graphics.addChild(this.notificationText);
    }

    clearTileGraphics(tile) {
      tile.rectGraphics.clear();
      tile.rectGraphics.removeChildren();
      tile.tempGraphics.clear();
      tile.borderGraphics.clear();
      tile.borderGraphics.removeChildren();
      tile.textGraphics.clear();
      tile.textGraphics.removeChildren();
    }

    /**
     * Draws exactly one tile.
     *
     * @param tile
     */
    renderTile(tile) {
      if (!tile.initialized) {
        return;
      }

      this.clearTileGraphics(tile);

      tile.svgDataRect = null;
      tile.svgDataText = null;

      tile.drawnAtScale = this._xScale.copy();

      // we're setting the start of the tile to the current zoom level
      const { tileX, tileWidth } = this.getTilePosAndDimensions(
        tile.tileData.zoomLevel,
        tile.tileData.tilePos,
        this.tilesetInfo.tile_size,
      );

      console.log('tile', tile, 'tileX:', tileX, tileWidth);

      this.drawColoredRectangles(tileX, tileWidth, tile);
      this.drawTextSequence(tileX, tileWidth, tile);
    }

    /**
     * Converts all colors in a colorScale to Hex colors.
     */
    localColorToHexScale() {
      const colorHexMap = {};
      for (let i = 0; i < this.colorScale.length; i++) {
        colorHexMap[this.colorScale[i]] = colorToHex(this.colorScale[i]);
      }
      this.colorHexMap = colorHexMap;
    }

    /**
     * un-flatten data into matrix of tile.tileData.shape[0] x tile.tileData.shape[1]
     *
     * @param tile
     * @returns {Array} 2d array of numerical values for each column
     */
    unFlatten(tile) {
      if (tile.matrix) {
        return;
      }

      tile.matrix =
        this.dataFetchingMode === 'fasta'
          ? (tile.matrix = tile.tileData.dense)
          : this.simpleUnFlatten(tile, tile.tileData.dense);

      console.log('tile', tile)
    }

    /**
     *
     * @param tile
     * @param data array of values to reshape
     * @returns {Array} 2D array representation of data
     */
    simpleUnFlatten(tile, data) {
      const shapeX = tile.tileData.shape[0]; // number of different nucleotides in each bar
      const shapeY = tile.tileData.shape[1]; // number of bars

      // matrix[0] will be [flattenedArray[0], flattenedArray[256], flattenedArray[512], etc.]
      // because of how flattenedArray comes back from the server.
      const matrix = [];
      for (let i = 0; i < shapeX; i++) {
        // 6
        for (let j = 0; j < shapeY; j++) {
          // 256;
          let singleBar;
          if (matrix[j] === undefined) {
            singleBar = [];
          } else {
            singleBar = matrix[j];
          }
          singleBar.push(data[shapeY * i + j]);
          matrix[j] = singleBar;
        }
      }

      return matrix;
    }

    /**
     * Map the arrays that we get from the server back to nucleotide letters
     * [1, 0, 0, 0, 0, 0] = A
     * [0, 1, 0, 0, 0, 0] = T
     * [0, 0, 1, 0, 0, 0] = G
     * [0, 0, 0, 1, 0, 0] = C
     * [0, 0, 0, 0, 1, 0] = N
     * [0, 0, 0, 0, 0, 1] = ""
     *
     * @param indexOfOne int that indicated where the 1 in the array is located
     * @return
     */
    getLetterFromArray(indexOfOne) {
      if (indexOfOne === 0) {
        return 'A';
      } else if (indexOfOne === 1) {
        return 'T';
      } else if (indexOfOne === 2) {
        return 'G';
      } else if (indexOfOne === 3) {
        return 'C';
      } else if (indexOfOne === 4) {
        return 'N';
      } else {
        return '.';
      }
    }

    /**
     * Map each value in every array in the matrix to a color and a letter and store it in the tile
     *
     * @param tile 2d array of numbers representing nucleotides
     * @return
     */
    createColorAndLetterData(tile) {
      if (!tile.matrix) {
        console.warn('Data has not been transformed to a matrix yet');
        return;
      }

      const matrix = tile.matrix;

      // mapping colors to unsorted values
      const matrixWithColors = [];
      for (let j = 0; j < matrix.length; j++) {
        let columnColors = {};

        const sum = matrix[j].reduce((pv, cv) => pv + cv, 0);

        if (sum === 1) {
          const ind = matrix[j].indexOf(1);
          columnColors = {
            letter: this.getLetterFromArray(ind),
            color: this.colorScale[ind],
          };
        } else if (this.options.colorAggregationMode === 'max') {
          const max = Math.max.apply(null, matrix[j]);
          // produces an array that has 1 if the entry is maximal, 0 otherwise
          const relevantEntries = matrix[j].map((x) => (x === max ? 1 : 0));
          const sumRelevantEntries = relevantEntries.reduce(
            (pv, cv) => pv + cv,
            0,
          );

          if (sumRelevantEntries === 1) {
            // one letter appears more often than any other
            const ind = relevantEntries.indexOf(1);
            columnColors = {
              letter: this.getLetterFromArray(ind),
              color: this.colorScale[ind],
            };
          } else {
            // Find indices of all nonzero entries
            const nonZeroInd = relevantEntries.reduce((res, number, index) => {
              if (number === 1) res.push(index);
              return res;
            }, []);

            // Get a random element and color according to that letter
            const ind =
              nonZeroInd[Math.floor(Math.random() * nonZeroInd.length)];
            columnColors = {
              letter: this.getLetterFromArray(ind),
              color: this.colorScale[ind],
            };
          }
        } else if (this.options.colorAggregationMode === 'weighted') {
          const weigths = matrix[j].map((el) => el / sum);

          const interpolatedColor = {};

          interpolatedColor.r = this.colorScaleRgb.reduce(function (
            res,
            cv,
            ind,
          ) {
            return res + weigths[ind] * cv.r;
          },
          0);

          interpolatedColor.g = this.colorScaleRgb.reduce(function (
            res,
            cv,
            ind,
          ) {
            return res + weigths[ind] * cv.g;
          },
          0);

          interpolatedColor.b = this.colorScaleRgb.reduce(function (
            res,
            cv,
            ind,
          ) {
            return res + weigths[ind] * cv.b;
          },
          0);

          // We limit the color space because we don't want to add too many colors to
          // the color map
          const hex = HGC.libraries.PIXI.utils.rgb2hex([
            (Math.round(interpolatedColor.r / 5) * 5) / 255.0,
            (Math.round(interpolatedColor.g / 5) * 5) / 255.0,
            (Math.round(interpolatedColor.b / 5) * 5) / 255.0,
          ]);
          const hexString = HGC.libraries.PIXI.utils.hex2string(hex);

          // Add new colors to the hex map
          this.colorHexMap[hexString] = hex;

          columnColors = {
            letter: this.getLetterFromArray(0),
            color: hexString,
          };
        }

        matrixWithColors.push(columnColors);
      }
      console.log('matrixWithColors', matrixWithColors);
      tile.colorAndLetterData = matrixWithColors;
      return;
    }

    drawTextSequence(tileX, tileWidth, tile) {
      tile.colorAndLetterData.forEach((td, i) => {
        const letter = td.letter;

        tile.texts[i] = new HGC.libraries.PIXI.Sprite(this.pixiTexts[letter]);
        tile.texts[i].width = this.letterWidths[letter];
        tile.texts[i].height = this.letterHeights[letter];
        tile.texts[i].letter = letter;
      });

      const trackHeight = this.dimensions[1];

      const matrix = tile.colorAndLetterData;
      const width =
        (this._xScale(tileX + tileWidth) - this._xScale(tileX)) / matrix.length;

      const margin = width - this.maxLetterWidth;

      let alphaSeq = 1.0;
      let alphaBar = 1.0;

      if (margin < 2) {
        return;
      } else if (margin < 5 && margin >= 2) {
        // gracefully fade out
        const alphaScale = scaleLinear()
          .domain([2, 5])
          .range([0, 1])
          .clamp(true);
        alphaSeq = alphaScale(width - this.maxLetterWidth);
        alphaBar = alphaSeq;
      }

      // If letters are higher than trackheight, hide sequence, show borders
      if (trackHeight - this.maxLetterHeight < 0) {
        alphaSeq = 0.0;
        alphaBar = 1.0;
      }

      tile.borderGraphics.alpha = alphaBar;
      tile.textGraphics.alpha = alphaSeq;

      for (let j = 0; j < matrix.length; j++) {
        // jth vertical bar in the graph
        const x = j * width;

        const text = tile.texts[j];
        const txStart = this._xScale(tileX + 1) + x;
        const txMiddle = txStart + width / 2 - text.width / 2;
        const tyMiddle = this.dimensions[1] / 2 - text.height / 2;

        text.position.x = txMiddle;
        text.position.y = tyMiddle;

        this.addSVGInfoText(
          tile,
          txMiddle,
          tyMiddle,
          tile.texts[j].letter,
          alphaSeq,
        );

        tile.textGraphics.addChild(text);

        if (this.options.barBorder) {
          tile.borderGraphics
            .lineStyle(1, this.barBorderColor)
            .moveTo(txStart, 0)
            .lineTo(txStart, trackHeight);
        }
      }
    }

    /**
     * Draws colored bars.
     *
     * @param tileX starting position of tile
     * @param tileWidth pre-scaled width of tile
     * @param tile
     */
    drawColoredRectangles(tileX, tileWidth, tile) {
      const trackHeight = this.dimensions[1];

      const width = 10;
      const matrix = tile.colorAndLetterData;

      for (let j = 0; j < matrix.length; j++) {
        // jth vertical bar in the graph
        const x = j * width;
        const nucleotide = matrix[j];

        this.addSVGInfoRect(tile, x, 0, width, trackHeight, nucleotide.color);

        tile.tempGraphics.beginFill(this.colorHexMap[nucleotide.color]);
        tile.tempGraphics.drawRect(x, 0, width, trackHeight);
      }

      // vertical bars are drawn onto the graphics object
      // and a texture is generated from that
      const texture = pixiRenderer.generateTexture(
        tile.tempGraphics,
        HGC.libraries.PIXI.SCALE_MODES.NEAREST,
      );
      const sprite = new HGC.libraries.PIXI.Sprite(texture);
      sprite.width = this._xScale(tileX + tileWidth) - this._xScale(tileX);
      console.log('sprint.width', sprite.width);
      sprite.height = trackHeight;
      sprite.x = this._xScale(tileX + 1);
      sprite.y = 0;
      //tile.sprite = sprite;

      tile.rectGraphics.addChild(sprite);
    }

    calculateVisibleTiles() {
      // if we don't know anything about this dataset, no point
      // in trying to get tiles

      if (!this.tilesetInfo) {
        return;
      }

      // calculate the zoom level given the scales and the data bounds
      this.zoomLevel = this.calculateZoomLevel();

      if (
        // For fasta files maxZoom is equal to the hightest zoom level
        // Therefore the notification is shown only two levels below highest zoom level
        // We leave it like that intentionally for now.
        this.zoomLevel < this.maxZoom - 3 &&
        this.options.colorAggregationMode === 'none'
      ) {
        this.showNotification();
        return;
      }
      this.hideNotification();

      let resolution = 1;
      // We only have resolution when working with multivec files
      if (this.tilesetInfo.resolutions) {
        const sortedResolutions = this.tilesetInfo.resolutions
          .map((x) => +x)
          .sort((a, b) => b - a);
        resolution = sortedResolutions[this.zoomLevel];
      }

      const xTiles = this.calculateTilesFromResolution(
        resolution,
        this._xScale,
        this.tilesetInfo.min_pos[0],
        this.tilesetInfo.max_pos[0],
        this.tilesetInfo.tile_size,
      );

      // For FASTA files we fix the resolution, therefore we also fix the zoomLevel
      // in the visible tiles
      const tiles =
        this.isMultivecSingleResSequence()
          ? xTiles.map((x) => [this.maxZoom, x])
          : xTiles.map((x) => [this.zoomLevel, x]);

      this.setVisibleTiles(tiles);
      return;
    }

    /**
     * Calculate the tiles that sould be visisble given the resolution and
     * the minX and maxX values for the region
     *
     * @param resolution: The number of base pairs per bin
     * @param scale: The scale to use to calculate the currently visible tiles
     * @param minX: The minimum x position of the tileset
     * @param maxX: The maximum x position of the tileset
     */
    calculateTilesFromResolution(resolution, scale, minX, maxX, pixelsPerTile) {
      const PIXELS_PER_TILE = pixelsPerTile || 256;
      const tileWidth = resolution * PIXELS_PER_TILE;

      let tileRange = tileProxy.calculateTilesFromResolution(
        resolution,
        scale,
        minX,
        maxX,
        PIXELS_PER_TILE,
      );

      if (this.options.extendedPreloading) {
        const firstTile = Math.max(Math.min.apply(null, tileRange) - 1, 0);
        const lastTile = Math.min(
          Math.max.apply(null, tileRange) + 1,
          Math.ceil(maxX / tileWidth),
        );
        tileRange.push(firstTile);
        tileRange.push(lastTile);
      }

      return tileRange;
    }

    /**
     * Adds information to recreate the rectangles in SVG to the tile
     *
     * @param tile
     * @param x x value of bar
     * @param y y value of bar
     * @param width width of bar
     * @param height height of bar
     * @param color color of bar (not converted to hex)
     */
    addSVGInfoRect(tile, x, y, width, height, color) {
      if (tile.hasOwnProperty('svgDataRect') && tile.svgDataRect !== null) {
        tile.svgDataRect.barXValues.push(x);
        tile.svgDataRect.barYValues.push(y);
        tile.svgDataRect.barWidths.push(width);
        tile.svgDataRect.barHeights.push(height);
        tile.svgDataRect.barColors.push(color);
      } else {
        tile.svgDataRect = {
          barXValues: [x],
          barYValues: [y],
          barWidths: [width],
          barHeights: [height],
          barColors: [color],
        };
      }
    }

    /**
     * Adds information to recreate the text in SVG to the tile
     *
     * @param tile
     * @param x x value of text
     * @param y y value of text
     * @param letter the letter as string
     */
    addSVGInfoText(tile, x, y, letter, alpha) {
      if (tile.hasOwnProperty('svgDataText') && tile.svgDataText !== null) {
        tile.svgDataText.letterXValues.push(x);
        tile.svgDataText.letterYValues.push(y);
        tile.svgDataText.letter.push(letter);
        tile.svgDataText.letterAlpha.push(alpha);
      } else {
        tile.svgDataText = {
          letterXValues: [x],
          letterYValues: [y],
          letter: [letter],
          letterAlpha: [alpha],
        };
      }
    }

    /**
     * Here, rerender all tiles every time track size is changed
     *
     * @param newDimensions
     */
    setDimensions(newDimensions) {
      super.setDimensions(newDimensions);

      const visibleAndFetched = this.visibleAndFetchedTiles();
      visibleAndFetched.map((a) => this.initTile(a));
    }

    exportSVG() {
      const visibleAndFetched = this.visibleAndFetchedTiles();
      visibleAndFetched.map((tile) => {
        this.initTile(tile);
        this.renderTile(tile);
      });

      let track = null;
      let base = null;

      base = document.createElement('g');
      track = base;

      [base, track] = super.superSVG();

      const output = document.createElement('g');
      track.appendChild(output);

      output.setAttribute(
        'transform',
        `translate(${this.pMain.position.x},${this.pMain.position.y}) scale(${this.pMain.scale.x},${this.pMain.scale.y})`,
      );

      if (
        this.zoomLevel < this.maxZoom - 3 &&
        this.options.colorAggregationMode === 'none'
      ) {
        const rect = document.createElement('rect');
        rect.setAttribute('fill', '#e0e0e0');
        rect.setAttribute('stroke', '#e0e0e0');
        rect.setAttribute('x', 0);
        rect.setAttribute('y', 0);
        rect.setAttribute('height', this.dimensions[1]);
        rect.setAttribute('width', this.dimensions[0]);
        output.appendChild(rect);

        const t = document.createElement('text');
        t.setAttribute('fill', '#33333');
        t.setAttribute('x', this.dimensions[0] / 2);
        t.setAttribute('y', this.dimensions[1] / 2 + 5);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('font-family', 'Arial');
        t.setAttribute('font-size', '14');
        //t.setAttribute("width", 4);
        //t.setAttribute("dy", 16);
        t.innerHTML = this.options.notificationText;
        output.appendChild(t);
        return [base, base];
      }

      for (const tile of this.visibleAndFetchedTiles()) {
        const g = document.createElement('g');
        const sprite = tile.rectGraphics.children[0];

        // place each sprite
        g.setAttribute(
          'transform',
          ` translate(${sprite.x},${sprite.y}) rotate(0) scale(${sprite.scale.x},${sprite.scale.y}) `,
        );

        const rectData = tile.svgDataRect;

        // add each bar
        for (let i = 0; i < rectData.barXValues.length; i++) {
          const rect = document.createElement('rect');
          rect.setAttribute('fill', rectData.barColors[i]);
          rect.setAttribute('stroke', rectData.barColors[i]);

          rect.setAttribute('x', rectData.barXValues[i]);
          rect.setAttribute('y', rectData.barYValues[i]);
          rect.setAttribute('height', rectData.barHeights[i]);
          rect.setAttribute('width', rectData.barWidths[i]);
          if (this.options.barBorder) {
            rect.setAttribute('stroke-width', '0.1');
            rect.setAttribute('stroke', this.options.barBorderColor);
          }

          g.appendChild(rect);
        }
        output.appendChild(g);

        if (tile.svgDataText !== null) {
          const g2 = document.createElement('g');
          const textData = tile.svgDataText;
          // add each text
          for (let i = 0; i < textData.letterXValues.length; i++) {
            const t = document.createElement('text');
            t.setAttribute('fill', '#FFFFFF');
            t.setAttribute('fill-opacity', textData.letterAlpha[i]);
            t.setAttribute('x', textData.letterXValues[i]);
            t.setAttribute('y', textData.letterYValues[i] - 1);
            t.setAttribute('font-family', 'Arial');
            t.setAttribute('font-size', '15');
            t.setAttribute('font-weight', 'bold');
            t.setAttribute('width', 4);
            t.setAttribute('dy', 16);

            t.innerHTML = textData.letter[i];

            g2.appendChild(t);
          }

          output.appendChild(g2);
        }
      }

      return [base, base];
    }

    /**
     * Prevent BarTracks updateTile method from having an effect
     *
     * @param tile
     */
    updateTile() {}

    /**
     * Prevent BarTracks drawTile method from having an effect
     *
     * @param tile
     */
    drawTile(tile) {}

    /**
     * Prevent BarTracks draw method from having an effect
     */
    draw() {}
  }
  return new SequenceTrackClass(...args);
};

const icon =
  '<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M-1-1h22v22H-1z"/><g><path stroke="#007fff" stroke-width="1.5" fill="#007fff" d="M-.667-.091h5v20.167h-5z"/><path stroke-width="1.5" stroke="#e8e500" fill="#e8e500" d="M5.667.242h5v20.167h-5z"/><path stroke-width="1.5" stroke="#ff0038" fill="#ff0038" d="M15.833.076h5v20.167h-5z"/><path stroke="green" stroke-width="1.5" fill="green" d="M10.833-.258H14.5v20.167h-3.667z"/></g></svg>';

// default
SequenceTrack.config = {
  type: 'horizontal-sequence',
  datatype: ['multivec'],
  local: false,
  orientation: '1d-horizontal',
  thumbnail: new DOMParser().parseFromString(icon, 'text/xml').documentElement,
  availableOptions: [
    'colorAggregationMode',
    'extendedPreloading',
    'labelPosition',
    'labelColor',
    'labelTextOpacity',
    'labelBackgroundOpacity',
    'notificationText',
    'trackBorderWidth',
    'trackBorderColor',
    'backgroundColor',
    'colorScale',
    'barBorder',
    'barBorderColor',
    'fontSize',
    'fontFamily',
    'fontColor',
  ],
  defaultOptions: {
    colorAggregationMode: 'none', // 'max', 'weighted'
    extendedPreloading: false,
    labelPosition: 'topLeft',
    labelColor: 'black',
    labelTextOpacity: 0.4,
    notificationText: 'Zoom in to see nucleotides...',
    trackBorderWidth: 0,
    trackBorderColor: 'white',
    backgroundColor: 'white',
    barBorder: true,
    barBorderColor: 'white',
    fontSize: 16,
    fontFamily: 'Arial',
    fontColor: 'white',
    colorScale: [
      // A T G C N other
      '#2c7bb6',
      '#abd9e9',
      '#ffffbf',
      '#fdae61',
      '#808080',
      '#DCDCDC',
    ],
  },
  optionsInfo: {
    colorScale: {
      name: 'Color scheme',
      inlineOptions: {
        default: {
          value: [
            // A T G C N other
            '#007FFF',
            '#e8e500',
            '#008000',
            '#FF0038',
            '#800080',
            '#DCDCDC',
          ],
          name: 'DRuMS',
        },
        logos: {
          value: [
            // A T G C N other
            '#22ca03',
            '#c40003',
            '#f6af08',
            '#0000c7',
            '#808080',
            '#DCDCDC',
          ],
          name: 'Logos / IGV',
        },
        bluesGreens: {
          value: [
            // A T G C N other
            '#a6cee3',
            '#1f78b4',
            '#b2df8a',
            '#33a02c',
            '#808080',
            '#DCDCDC',
          ],
          name: 'Blues / Greens  (CB friendly)',
        },
        bluesBeiges: {
          value: [
            '#08519c',
            '#6baed6',
            '#993404',
            '#fe9929',
            '#808080',
            '#DCDCDC',
          ],
          name: 'Blues / Beiges (CB friendly)',
        },
      },
    },
  },
};

export default SequenceTrack;
