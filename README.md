# Nucleotide sequence tracks for HiGlass

Display nucleotide sequence tracks in HiGlass!

![Sequence track](https://aveit.s3.amazonaws.com/higlass/static/higlass-sequence-screenshot.png)


**Note**: This is the source code for the sequence track only! You might want to check out the following repositories as well:

- HiGlass viewer: https://github.com/higlass/higlass
- HiGlass server: https://github.com/higlass/higlass-server
- HiGlass docker: https://github.com/higlass/higlass-docker


## Installation
 
```
npm install higlass-sequence
```

## Usage

The live script can be found at:

- https://unpkg.com/higlass-sequence/dist/higlass-sequence.min.js

### Client

1. Make sure you load this track prior to `hglib.js`. For example:

```
<script src="/higlass-sequence.min.js"></script>
<script src="hglib.js"></script>
<script>
  ...
</script>
```

2. higlass-sequence can load sequence data in two ways:
  - Convert a FASTA file into the multivec format. Use this format if you need aggregation on lower zoom levels. See the `colorAggregationMode` option below. The script `scripts/fasta_to_hdf5.py` will convert your FASTA file into the hdf5 format which then can be converted to the multivec format (see the [HiGlass docs](https://docs.higlass.io/data_preparation.html#multivec-files) for more information). After ingesting the multivec file into a HiGlass server, you can configure the track in your view config in the usual way, using a `server` and `tilesetUid`:
  ```
  {
    "server": "http://localhost:8001/api/v1",
    "tilesetUid": "ScrlBGMbR_WJ0fzKXxKFzA",
    "uid": "seq_multivec_example",
    "type": "horizontal-sequence",
    "options": {
      ...
    },
    "width": 568,
    "height": 25
  },
 ```
  - The sequence track can also load the data directly into the client using indexed FASTA files. No running HiGlass server is required in this case. The only additional data required (besides the FASTA file) is a `fai` index file and a chrom sizes file. The track then can be configured in the following way:
   ```
  {
    "uid": "seq_fasta_example",
    "type": "horizontal-sequence",
    "data": {
      "type": "fasta",
      "fastaUrl": "https://aveit.s3.amazonaws.com/higlass/data/sequence/hg38.fa",
      "faiUrl": "https://aveit.s3.amazonaws.com/higlass/data/sequence/hg38.fa.fai",
      "chromSizesUrl": "https://aveit.s3.amazonaws.com/higlass/data/sequence/hg38.mod.chrom.sizes"
    },
    "options": {
      ...
    },
    "width": 568,
    "height": 25
  },
 ```
 
>Using indexed FASTA files is easier and faster than multivec files. If no aggregation is needed, this is the preferred way to load data in higlass-sequence.

For an example, see [`src/index.html`](src/index.html).

3. Options
The following options are available:
```
{
   "colorAggregationMode": "none", // ['none', 'max', 'weighted']. Ignored when using indexed FASTA files. Determines how pixels are colored on lower zoom levels. 'max' colors the pixels according to the nucleotide with the highest occurence. 'weighted' uses a weighted interpolation of colors.
   "extendedPreloading": false, // More tiles than necessary are loaded. Leads to a smoother horizontal scrolling especially for multivec files.
   "labelPosition": "topLeft",
   "labelColor": "black",
   "labelTextOpacity": 0.4,
   "notificationText": "Zoom in to see nucleotides...", // Notification text if colorAggregationMode == "none" and user zooms out too far.
   "trackBorderWidth": 0,
   "trackBorderColor": "white",
   "backgroundColor": "white",
   "barBorder": true,
   "barBorderColor": "white",
   "fontSize": 16, // size of the letters
   "fontFamily": "Arial",
   "fontColor": "white",
   "colorScale": [
     "#007FFF", // color of A
     "#e8e500", // color of T
     "#008000", // color of G
     "#FF0038", // color of C
     "#800080", // color of N
     "#DCDCDC", // color of everything else
   ],
 }
```

### ECMAScript Modules (ESM)

We also build out ES modules for usage by applications who may need to import or use `higlass-sequence` as a component.

Whenever there is a statement such as the following, assuming `higlass-sequence` is in your node_modules folder:
```javascript
import { SequenceTrack } from 'higlass-sequence';
```

Then SequenceTrack would automatically be imported from the `./es` directory (set via package.json's `"module"` value). 

## Support

For questions, please either open an issue or ask on the HiGlass Slack channel at http://bit.ly/higlass-slack

## Development

### Testing

To run the test suite:

```
npm run test-watch
```


### Installation

```bash
$ git clone https://github.com/higlass/higlass-sequence.git
$ cd higlass-sequence
$ npm install
```
If you have a local copy of higlass, you can then run this command in the higlass-sequence directory:

```bash
npm link higlass
```

### Commands

 - **Developmental server**: `npm start`
 - **Production build**: `npm run build`
