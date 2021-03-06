/**
 * Copyright 2015 CANAL+ Group
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// XML-Schema
// <http://standards.iso.org/ittf/PubliclyAvailableStandards/MPEG-DASH_schema_files/DASH-MPD.xsd>

var _ = require("canal-js-utils/misc");
var assert = require("canal-js-utils/assert");

var iso8601Duration = /^P(([\d.]*)Y)?(([\d.]*)M)?(([\d.]*)D)?T?(([\d.]*)H)?(([\d.]*)M)?(([\d.]*)S)?/;
var rangeRe = /([0-9]+)-([0-9]+)/;
var frameRateRe = /([0-9]+)(\/([0-9]+))?/;

// TODO(pierre): support more than juste timeline index type
function calcLastRef(index) {
  var { ts, r, d } = _.last(index.timeline);
  return ((ts + (r+1)*d) / index.timescale);
}

function feedAttributes(node, base) {
  var attrs = attributes[node.nodeName];

  assert(attrs, "parser: no attributes for " + node.nodeName);

  return _.reduce(attrs, (obj, { k, fn, n, def }) => {
    if (node.hasAttribute(k)) {
      obj[n || k] = fn(node.getAttribute(k));
    } else if (def != null) {
      obj[n || k] = def;
    }
    return obj;
  }, base || {});
}

function parseString(str) {
  return str;
}

function parseBoolean(str) {
  return str == "true";
}

function parseIntOrBoolean(str) {
  if (str == "true") return true;
  if (str == "false") return false;
  return parseInt(str);
}

function parseDateTime(str) {
  return new Date(Date.parse(str));
}

function parseDuration(date) {
  if (!date) return 0;

  var match = iso8601Duration.exec(date);
  assert(match, `parser: ${date} is not a valid ISO8601 duration`);

  return (
    parseFloat(match[2]  || 0) * 365 * 24 * 60 * 60 +
    parseFloat(match[4]  || 0) * 30 * 24 * 60 * 60 + // not precise +
    parseFloat(match[6]  || 0) * 24 * 60 * 60 +
    parseFloat(match[8]  || 0) * 60 * 60 +
    parseFloat(match[10] || 0) * 60 +
    parseFloat(match[12] || 0)
  );
}

function parseFrameRate(str) {
  var match = frameRateRe.exec(str);
  if (!match) return -1;

  var nom = parseInt(match[1]) || 0;
  var den = parseInt(match[2]) || 0;
  return den > 0
    ? nom / den
    : nom;
}

function parseRatio(str) {
  return str;
}

function parseByteRange(str) {
  var match = rangeRe.exec(str);
  if (!match)
    return null;
  else
    return [+match[1], +match[2]];
}

var RepresentationBaseType = [
  { k: "profiles",          fn: parseString },
  { k: "width",             fn: parseInt },
  { k: "height",            fn: parseInt },
  { k: "frameRate",         fn: parseFrameRate },
  { k: "audioSamplingRate", fn: parseString },
  { k: "mimeType",          fn: parseString },
  { k: "segmentProfiles",   fn: parseString },
  { k: "codecs",            fn: parseString },
  { k: "maximumSAPPeriod",  fn: parseFloat },
  { k: "maxPlayoutRate",    fn: parseFloat },
  { k: "codingDependency",  fn: parseBoolean },
];

var SegmentBaseType = [
  { k: "timescale",                fn: parseInt },
  { k: "presentationTimeOffset",   fn: parseFloat, def: 0 },
  { k: "indexRange",               fn: parseByteRange },
  { k: "indexRangeExact",          fn: parseBoolean },
  { k: "availabilityTimeOffset",   fn: parseFloat },
  { k: "availabilityTimeComplete", fn: parseBoolean },
];

var MultipleSegmentBaseType = SegmentBaseType.concat([
  { k: "duration",    fn: parseInt },
  { k: "startNumber", fn: parseInt },
]);

var attributes = {
  "ContentProtection": [
    { k: "schemeIdUri", fn: parseString },
    { k: "value", fn: parseString },
  ],

  "SegmentURL": [
    { k: "media",      fn: parseString },
    { k: "mediaRange", fn: parseByteRange },
    { k: "index",      fn: parseString },
    { k: "indexRange", fn: parseByteRange }
  ],

  "S": [
    { k: "t", fn: parseInt, n: "ts"},
    { k: "d", fn: parseInt },
    { k: "r", fn: parseInt },
  ],

  "SegmentTimeline": [],
  "SegmentBase": SegmentBaseType,
  "SegmentTemplate": MultipleSegmentBaseType.concat([
    { k: "initialization",     fn: parseInitializationAttribute },
    { k: "index",              fn: parseString },
    { k: "media",              fn: parseString },
    { k: "bitstreamSwitching", fn: parseString }
  ]),
  "SegmentList": MultipleSegmentBaseType,

  "ContentComponent": [
    { k: "id",          fn: parseString },
    { k: "lang",        fn: parseString },
    { k: "contentType", fn: parseString },
    { k: "par",         fn: parseRatio },
  ],

  "Representation": RepresentationBaseType.concat([
    { k: "id",             fn: parseString },
    { k: "bandwidth",      fn: parseInt, n: "bitrate" },
    { k: "qualityRanking", fn: parseInt },
  ]),

  "AdaptationSet": RepresentationBaseType.concat([
    { k: "id",                  fn: parseString },
    { k: "group",               fn: parseInt },
    { k: "lang",                fn: parseString },
    { k: "contentType",         fn: parseString },
    { k: "par",                 fn: parseRatio },
    { k: "minBandwidth",        fn: parseInt, n: "minBitrate" },
    { k: "maxBandwidth",        fn: parseInt, n: "maxBitrate" },
    { k: "minWidth",            fn: parseInt },
    { k: "maxWidth",            fn: parseInt },
    { k: "minHeight",           fn: parseInt },
    { k: "maxHeight",           fn: parseInt },
    { k: "minFrameRate",        fn: parseFrameRate },
    { k: "maxFrameRate",        fn: parseFrameRate },
    { k: "segmentAlignment",    fn: parseIntOrBoolean },
    { k: "subsegmentAlignment", fn: parseIntOrBoolean },
    { k: "bitstreamSwitching",  fn: parseBoolean },
  ]),

  "Period": [
    { k: "id",                 fn: parseString },
    { k: "start",              fn: parseDuration },
    { k: "duration",           fn: parseDuration },
    { k: "bitstreamSwitching", fn: parseBoolean }
  ],

  "MPD": [
    { k: "id",                         fn: parseString },
    { k: "profiles",                   fn: parseString },
    { k: "type",                       fn: parseString },
    { k: "availabilityStartTime",      fn: parseDateTime },
    { k: "availabilityEndTime",        fn: parseDateTime },
    { k: "publishTime",                fn: parseDateTime },
    { k: "mediaPresentationDuration",  fn: parseDuration, n: "duration" },
    { k: "minimumUpdatePeriod",        fn: parseDuration },
    { k: "minBufferTime",              fn: parseDuration },
    { k: "timeShiftBufferDepth",       fn: parseDuration },
    { k: "suggestedPresentationDelay", fn: parseDuration },
    { k: "maxSegmentDuration",         fn: parseDuration },
    { k: "maxSubsegmentDuration",      fn: parseDuration },
  ]
};

function reduceChildren(root, fn, init) {
  var node = root.firstElementChild, r = init;
  while (node) {
    r = fn(r, node.nodeName, node);
    node = node.nextElementSibling;
  }
  return r;
}

function parseContentProtection(root, contentProtectionParser) {
  return contentProtectionParser(feedAttributes(root), root);
}

function parseSegmentBase(root) {
  var index = reduceChildren(root, (res, name, node) => {
    if (name == "Initialization") {
      res.initialization = parseInitialization(node);
    }
    return res;
  }, feedAttributes(root));
  if (root.nodeName == "SegmentBase") {
    index.indexType = "base";
    index.timeline = [];
  }
  return index;
}

function parseMultipleSegmentBase(root) {
  return reduceChildren(root, (res, name, node) => {
    if (name == "SegmentTimeline") {
      res.indexType = "timeline";
      res.timeline = parseSegmentTimeline(node);
    }
    return res;
  }, parseSegmentBase(root));
}

function parseSegmentTimeline(root) {
  return reduceChildren(root, (arr, name, node) => {
    var len = arr.length;
    var seg = feedAttributes(node);
    if (seg.ts == null) {
      var prev = (len > 0) && arr[len - 1];
      seg.ts = prev
        ? prev.ts + prev.d * (prev.r + 1)
        : 0;
    }
    if (seg.r == null) {
      seg.r = 0;
    }
    arr.push(seg);
    return arr;
  }, []);
}

function parseInitializationAttribute(attrValue) {
  return { media: attrValue, range: undefined };
}

function parseInitialization(root) {
  var range, media;

  if (root.hasAttribute("range"))
    range = parseByteRange(root.getAttribute("range"));

  if (root.hasAttribute("sourceURL"))
    media = root.getAttribute("sourceURL");

  return { range, media };
}

function parseSegmentTemplate(root) {
  var base = parseMultipleSegmentBase(root);
  if (!base.indexType) {
    base.indexType = "template";
  }
  return base;
}

function parseSegmentList(root) {
  var base = parseMultipleSegmentBase(root);
  base.list = [];
  base.indexType = "list";
  return reduceChildren(root, (res, name, node) => {
    if (name == "SegmentURL") {
      res.list.push(feedAttributes(node));
    }
    return res;
  }, base);
}

function parseRepresentation(root) {
  var rep = reduceChildren(root, (res, name, node) => {
    switch(name) {
     // case "FramePacking": break;
     // case "AudioChannelConfiguration": break;
     // case "ContentProtection": res.contentProtection = parseContentProtection(node); break;
     // case "EssentialProperty": break;
     // case "SupplementalProperty": break;
     // case "InbandEventStream": break;
    case "BaseURL": res.baseURL = node.textContent; break;
    // case "SubRepresentation": break;
    case "SegmentBase": res.index = parseSegmentBase(node); break;
    case "SegmentList": res.index = parseSegmentList(node); break;
    case "SegmentTemplate": res.index = parseSegmentTemplate(node); break;
    }
    return res;
  }, {});

  return feedAttributes(root, rep);
}

function parseContentComponent(root) {
  return feedAttributes(root);
}

function parseAdaptationSet(root, contentProtectionParser) {
  var res = reduceChildren(root, (res, name, node) => {
    switch(name) {
    // case "Accessibility": break;
    // case "Role": break;
    // case "Rating": break;
    // case "Viewpoint": break;
    case "ContentProtection": res.contentProtection = parseContentProtection(node, contentProtectionParser); break;
    case "ContentComponent": res.contentComponent = parseContentComponent(node); break;
    case "BaseURL": res.baseURL = node.textContent; break;
    case "SegmentBase": res.index = parseSegmentBase(node); break;
    case "SegmentList": res.index = parseSegmentList(node); break;
    case "SegmentTemplate": res.index = parseSegmentTemplate(node); break;
    case "Representation": res.representations.push(parseRepresentation(node)); break;
    }
    return res;
  }, { representations: [] });

  return feedAttributes(root, res);
}

function parsePeriod(root, contentProtectionParser) {
  var attrs = feedAttributes(root, reduceChildren(root, (res, name, node) => {
    switch(name) {
    case "BaseURL": res.baseURL = node.textContent; break;
    case "AdaptationSet": res.adaptations.push(parseAdaptationSet(node, contentProtectionParser)); break;
    }
    return res;
  }, { adaptations: [] }));

  if (attrs.baseURL) {
    _.each(attrs.adaptations, adaptation => _.defaults(adaptation, { baseURL: attrs.baseURL }));
  }

  return attrs;
}

function parseFromDocument(document, contentProtectionParser) {
  var root = document.documentElement;
  assert.equal(root.nodeName, "MPD", "parser: document root should be MPD");

  var manifest = reduceChildren(root, (res, name, node) => {
    switch(name) {
    case "BaseURL": res.baseURL = node.textContent; break;
    case "Location": res.locations.push(node.textContent); break;
    case "Period": res.periods.push(parsePeriod(node, contentProtectionParser)); break;
    }
    return res;
  }, {
    transportType: "dash",
    periods: [],
    locations: [],
  });

  manifest = feedAttributes(root, manifest);

  if (/isoff-live/.test(manifest.profiles)) {
    var adaptations = manifest.periods[0].adaptations;
    var videoAdaptation = _.find(adaptations, a => a.mimeType == "video/mp4");

    var videoIndex = videoAdaptation && videoAdaptation.index;

    if (__DEV__) {
      assert(videoIndex && (videoIndex.indexType == "timeline" || videoIndex.indexType == "template"));
      assert(manifest.availabilityStartTime);
    }

    var lastRef;
    if (videoIndex.timeline) {
      lastRef = calcLastRef(videoIndex);
    }
    else {
      lastRef = Date.now() / 1000 - 60;
    }

    manifest.availabilityStartTime = manifest.availabilityStartTime.getTime() / 1000;
    manifest.presentationLiveGap = Date.now() / 1000 - (lastRef + manifest.availabilityStartTime);
  }

  return manifest;
}

function parseFromString(manifest, contentProtectionParser) {
  return parseFromDocument(new DOMParser().parseFromString(manifest, "application/xml"), contentProtectionParser);
}

function parser(manifest, contentProtectionParser) {
  if (_.isString(manifest)) return parseFromString(manifest, contentProtectionParser);
  if (manifest instanceof window.Document) return parseFromDocument(manifest, contentProtectionParser);
  throw new Error("parser: unsupported type to parse");
}

parser.parseFromString   = parseFromString;
parser.parseFromDocument = parseFromDocument;

module.exports = parser;
