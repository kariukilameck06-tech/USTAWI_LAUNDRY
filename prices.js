// Ustawi default price list (KES). Loaded into the database on first run.
// After that the admin edits prices in the dashboard (Admin > Services & prices) - no need to touch this file.
// Format per line:  Name: price   |   Name: from price   |   Name: price per unit
const LIST = {
laundry: `T-shirt: 80
Shirt: 120
Trouser: 150
Jeans: 180
Shorts: 80
Skirt: 120
Blouse: 120
Dress: 200
Sweater: 150
Hoodie: 180
School uniform set: 200
School blazer: 250
Two-piece suit: 500
Three-piece suit: 650
Jacket: 250
Coat: 350
Socks per pair: 20
Vest: 40
Underwear: 30
Tie: 50
Kanzu: 250
Buibui: 250
Tracksuit set: 250
Pajamas set: 180
Bathrobe: 200
Small towel: 60
Large towel: 120
Single bedsheet: 120
Double bedsheet: 180
Pillowcase: 40
Small blanket: 300
Large blanket: 400
Duvet 4x6: 400
Duvet 5x6: 500
Duvet 6x6: 600
King-size duvet: 700
Mattress cover: 200
Duvet cover: 150
Mosquito net: 120
Curtains: 200 per kg
Carpet: from 300
Shoes: from 250
Wash and fold: 150 per kg
Wash, dry and iron: 200 per kg
Ironing shirt only: 70
Ironing trouser only: 80
Delivery: from 100`,
computer: `Black-and-white printing: 5 per page
Colour text printing: 10 per page
Full-colour printing: 20 per page
Black-and-white photocopy: 5 per page
Colour photocopy: 15 per page
Scanning: 10 per page
Scan and email: 30 per document
Simple typing: 20 per page
Handwritten typing: 40 per page
CV preparation: 250
Professional CV design: 400
Cover letter: 100
Online application assistance: 100
Document formatting: from 100
PDF conversion: 20 per document
Lamination ID size: 20
Lamination A4: 40
Lamination A3: 80
Spiral binding: from 80
Passport photo printing: from 100 per set
Computer use: 30 per 30 minutes
Software installation: from 200
Windows installation: from 800
Computer troubleshooting: from 250
Computer cleaning: from 400
Data backup: from 200`,
tailoring: `Trouser shortening: 100
Trouser waist adjustment: 150
Trouser zip replacement: 150
Trouser patching: 80
Trouser tapering: 200
Shirt shortening: 120
Button replacement: 20 each
Shirt sleeve adjustment: 120
Dress shortening: 150
Dress zip replacement: 150
Dress waist adjustment: 200
Skirt shortening: 120
Skirt zip replacement: 120
Skirt waist adjustment: 120
Blouse alteration: 120
Jacket sleeve alteration: from 250
Coat alteration: from 300
School uniform repair: from 80
School uniform stitching: from 500
Trouser stitching: from 500
Shirt stitching: from 500
Simple skirt stitching: from 450
Simple dress stitching: from 700
Kitenge dress stitching: from 900
Kitenge shirt stitching: from 500
Suit stitching: from 2500
Curtain stitching: from 150 per panel
Bedsheet stitching: from 250
Pillowcase stitching: from 80
General clothing repair: from 80`,
stationery: `Standard pen: 10
Pencil: 10
Eraser: 5
Sharpener: 10
15 cm ruler: 10
30 cm ruler: 20
Exercise book 32 pages: 15
Exercise book 48 pages: 20
Exercise book 64 pages: 25
Exercise book 96 pages: 40
Exercise book 120 pages: 50
Exercise book 200 pages: 80
Manila paper: 10 per sheet
Graph paper: 5 per sheet
Mathematical set: from 80
Basic calculator: from 200
Scientific calculator: from 600
A4 envelope: 5
Brown envelope: from 10
Manila folder: 15
Clear folder: 15
Spring file: from 70
Box file: from 200
Stapler: from 120
Staples: from 20 per box
Paper clips: from 20 per box
Glue stick: from 20
Liquid glue: from 40
Sellotape: from 20
Scissors: from 80
Crayons: from 80 per box
Coloured pencils: from 120 per box
Drawing book: from 40
A4 photocopy paper: from 550 per ream
A3 paper: from 900 per ream
Counter book: from 120
Receipt book: from 80
Cash sale book: from 80
Spiral notebook: from 80
Clipboard: from 120
School bag: from 600`
};
const DEFAULT_UNIT = { laundry: 'per item', computer: 'per job', tailoring: 'per item', stationery: 'each' };
const UNIT_FOR = { 'Shoes': 'per pair', 'Delivery': 'per trip', 'School uniform set': 'per set', 'Tracksuit set': 'per set', 'Pajamas set': 'per set',
  'Two-piece suit': 'per suit', 'Three-piece suit': 'per suit', 'Windows installation': 'per computer', 'Computer cleaning': 'per computer',
  'Software installation': 'per installation', 'CV preparation': 'per CV', 'Professional CV design': 'per CV', 'Cover letter': 'per letter',
  'Online application assistance': 'per application', 'Document formatting': 'per document', 'Spiral binding': 'per document',
  'Lamination ID size': 'each', 'Lamination A4': 'each', 'Lamination A3': 'each', 'Computer troubleshooting': 'per job', 'Data backup': 'per job' };

// -> [{dept,name,unit,price,from}]
module.exports = Object.entries(LIST).flatMap(([dept, txt]) => txt.split('\n').map(l => {
  let [name, val] = l.split(/:\s*/); const from = /^from\s/i.test(val); val = val.replace(/^from\s+/i, '');
  const m = val.match(/^(\d+)(?:\s+(per .+|each))?$/); let unit = (m[2] || '').trim();
  const nm = name.match(/^(.*) (per pair)$/); if (nm) { name = nm[1]; unit = nm[2]; }
  return { dept, name, unit: unit || UNIT_FOR[name] || DEFAULT_UNIT[dept], price: Number(m[1]), from };
}));
