import {config} from '../src/config.js';
import {registerBidder} from '../src/adapters/bidderFactory.js';
import * as utils from '../src/utils.js';
import {BANNER, VIDEO} from '../src/mediaTypes.js';
import includes from 'core-js-pure/features/array/includes.js';

const bidderConfig = 'hb_pb_ortb';
const bidderVersion = '1.0';
const VIDEO_TARGETING = ['startdelay', 'mimes', 'minduration', 'maxduration',
  'startdelay', 'skippable', 'playbackmethod', 'api', 'protocols', 'boxingallowed',
  'linearity', 'delivery', 'protocol', 'placement', 'minbitrate', 'maxbitrate', 'ext'];

export const spec = {
  code: 'swan',
  supportedMediaTypes: [BANNER, VIDEO],
  isBidRequestValid,
  buildRequests,
  interpretResponse,
  getUserSyncs,
  transformBidParams
};

registerBidder(spec);

function transformBidParams(params, isOpenRtb) {
  return utils.convertTypes({
    'unit': 'string',
    'customFloor': 'number'
  }, params);
}

function isBidRequestValid(bidRequest) {
  return !!(bidRequest.params.endpoint);
}

function buildRequests(bids, bidderRequest) {
  let videoBids = bids.filter(bid => isVideoBid(bid));
  let bannerBids = bids.filter(bid => isBannerBid(bid));
  let requests = bannerBids.length ? [createBannerRequest(bannerBids, bidderRequest)] : [];
  videoBids.forEach(bid => {
    requests.push(createVideoRequest(bid, bidderRequest));
  });
  return requests;
}

function createBannerRequest(bids, bidderRequest) {
  let data = getBaseRequest(bids[0], bidderRequest);
  data.imp = bids.map(bid => {
    const floor = getFloor(bid, BANNER);
    let imp = {
      id: bid.bidId,
      tagid: bid.adUnitCode,
      banner: {
        format: toFormat(bid.mediaTypes.banner.sizes),
        topframe: utils.inIframe() ? 0 : 1
      }
    };
    if (floor > 0) {
      imp.bidfloor = floor;
      imp.bidfloorcur = 'USD';
    }
    return imp;
  });
  return {
    method: 'POST',
    url: bids[0].params.endpoint,
    data: data
  }
}

function toFormat(sizes) {
  return sizes.map((s) => {
    return { w: s[0], h: s[1] };
  });
}

function createVideoRequest(bid, bidderRequest) {
  let width;
  let height;
  const playerSize = utils.deepAccess(bid, 'mediaTypes.video.playerSize');
  const context = utils.deepAccess(bid, 'mediaTypes.video.context');
  const floor = getFloor(bid, VIDEO);
  // normalize config for video size
  if (utils.isArray(bid.sizes) && bid.sizes.length === 2 && !utils.isArray(bid.sizes[0])) {
    width = parseInt(bid.sizes[0], 10);
    height = parseInt(bid.sizes[1], 10);
  } else if (utils.isArray(bid.sizes) && utils.isArray(bid.sizes[0]) && bid.sizes[0].length === 2) {
    width = parseInt(bid.sizes[0][0], 10);
    height = parseInt(bid.sizes[0][1], 10);
  } else if (utils.isArray(playerSize) && playerSize.length === 2) {
    width = parseInt(playerSize[0], 10);
    height = parseInt(playerSize[1], 10);
  }
  let data = getBaseRequest(bid, bidderRequest);
  data.imp = [{
    id: bid.bidId,
    tagid: bid.adUnitCode,
    video: {
      w: width,
      h: height,
      topframe: utils.inIframe() ? 0 : 1
    }
  }];
  if (floor > 0) {
    data.imp[0].bidfloor = floor;
    data.imp[0].bidfloorcur = 'USD';
  }
  if (bid.params.video) {
    Object.keys(bid.params.video)
      .filter(param => includes(VIDEO_TARGETING, param))
      .forEach(param => data.imp[0].video[param] = bid.params.video[param]);
  }
  if (context) {
    if (context === 'instream') {
      data.imp[0].video.placement = 1;
    } else if (context === 'outstream') {
      data.imp[0].video.placement = 4;
    }
  }
  return {
    method: 'POST',
    url: bids.params.endpoint,
    data: data
  }
}

function getBaseRequest(bid, bidderRequest) {
  let req = {
    id: bidderRequest.auctionId,
    cur: [config.getConfig('currency.adServerCurrency') || 'USD'],
    at: 1,
    tmax: config.getConfig('bidderTimeout'),
    site: {
      page: config.getConfig('pageUrl') || bidderRequest.refererInfo.referer
    },
    regs: {
      coppa: config.getConfig('coppa') === true ? 1 : 0,
    },
    device: {
      dnt: utils.getDNT() ? 1 : 0,
      h: screen.height,
      w: screen.width,
      ua: window.navigator.userAgent,
      language: window.navigator.language.split('-').shift()
    }
  };
  if (bid.params.test) {
    req.test = 1
  }
  if (bidderRequest.gdprConsent) {
    if (bidderRequest.gdprConsent.gdprApplies !== undefined) {
      utils.deepSetValue(req, 'regs.ext.gdpr', bidderRequest.gdprConsent.gdprApplies === true ? 1 : 0);
    }
    if (bidderRequest.gdprConsent.consentString !== undefined) {
      utils.deepSetValue(req, 'user.ext.consent', bidderRequest.gdprConsent.consentString);
    }
    if (bidderRequest.gdprConsent.addtlConsent !== undefined) {
      utils.deepSetValue(req, 'user.ext.ConsentedProvidersSettings.consented_providers', bidderRequest.gdprConsent.addtlConsent);
    }
  }
  if (bidderRequest.uspConsent) {
    utils.deepSetValue(req, 'regs.ext.us_privacy', bidderRequest.uspConsent);
  }
  if (bid.schain) {
    utils.deepSetValue(req, 'source.ext.schain', bid.schain);
  }
  if (bid.userIdAsEids) {
    utils.deepSetValue(req, 'user.ext.eids', bid.userIdAsEids);
  }
  return req;
}

function isVideoBid(bid) {
  return utils.deepAccess(bid, 'mediaTypes.video');
}

function isBannerBid(bid) {
  return utils.deepAccess(bid, 'mediaTypes.banner') || !isVideoBid(bid);
}

function getFloor(bid, mediaType) {
  let floor = 0;

  if (typeof bid.getFloor === 'function') {
    const floorInfo = bid.getFloor({
      currency: 'USD',
      mediaType: mediaType,
      size: '*'
    });

    if (typeof floorInfo === 'object' &&
      floorInfo.currency === 'USD' &&
      !isNaN(parseFloat(floorInfo.floor))) {
      floor = Math.max(floor, parseFloat(floorInfo.floor));
    }
  }

  return floor;
}

function interpretResponse(resp, req) {
  const respBody = resp.body;

  if (respBody.ext && respBody.ext.swan_owids) {
    const owids = respBody.ext.swan_owids;
    window.swan_owids = window.swan_owids || {};
    owids.forEach(data => {
      let tagid = "unknown"
      console.log(data)
      const imp = req.data.imp.find((x) => x.id == data.impid)
      if (imp) {
        tagid = imp.tagid;
      }
      if (window.swan) {
        window.swan.addSignature(tagid, data.owid);
      }
    })
  }

  if (!respBody) {
    return [];
  }

  let bids = [];
  respBody.seatbid.forEach(seatbid => {
    bids = [...bids, ...seatbid.bid.map(bid => {
      let response = {
        requestId: bid.impid,
        cpm: bid.price,
        width: bid.w,
        height: bid.h,
        creativeId: bid.crid,
        dealId: bid.dealid,
        currency: respBody.cur || 'USD',
        netRevenue: true,
        ttl: 300,
        mediaType: 'banner' in req.data.imp[0] ? BANNER : VIDEO,
        meta: { advertiserDomains: bid.adomain }
      };

      if (response.mediaType === VIDEO) {
        if (bid.nurl) {
          response.vastUrl = bid.nurl;
        } else {
          response.vastXml = bid.adm;
        }
      } else {
        response.ad = bid.adm;
      }

      if (bid.ext) {
        response.meta.networkId = bid.ext.dsp_id;
        response.meta.advertiserId = bid.ext.buyer_id;
        response.meta.brandId = bid.ext.brand_id;
      }
      return response
    })];
  });

  return bids;
}
/**
 * @param syncOptions
 * @param responses
 * @param gdprConsent
 * @param uspConsent
 * @return {{type: (string), url: (*|string)}[]}
 */
function getUserSyncs(syncOptions, responses, gdprConsent, uspConsent) {
}
