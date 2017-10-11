import {registerBidder} from 'src/adapters/bidderFactory';
import {userSync} from 'src/userSync';
import { VIDEO } from 'src/mediaTypes';

const SUPPORTED_AD_TYPES = [VIDEO];
const BIDDER_CODE = 'openxvideo';

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: SUPPORTED_AD_TYPES,
  isBidRequestValid: function(bid) {
    return !!(bid.params.unit || bid.params.delDomain);
  },
  buildRequests: function(bids) {
    let delDomain = bids[0].params.delDomain;
    let url = 'http://' + delDomain + '/v/1.0/avjp';
    let oxVideoParams = generateVideoParameters(bids);
    return {
      method: 'GET',
      url: url,
      data: oxVideoParams,
      payload: {'bids': bids, 'startTime': new Date()}
    };
  },
  interpretResponse: function(oxResponseObj, bidRequest) {
    let bidResponses = [];
    const parts = oxResponseObj.match(/^[a-z0-9]+\(([^\)]+)\)/i);
    let response = !parts || parts.length != 2 ? undefined : JSON.parse(parts[1]);
    if (response && response.pixels) {
      userSync.registerSync('iframe', 'openxvideo', response.pixels);
    }
    bidResponses = createVideoBidResponses(response, bidRequest.payload);
    return bidResponses;
  }
};

function generateVideoParameters(bids) {
  let oxVideo = bids[0].params.video;
  let oxVideoParams = {
    auid: bids[0].params.unit,
    url: oxVideo.url,
    jsonp: 'json'
  };

  if (oxVideo.vtest) {
    oxVideoParams.vtest = oxVideo.vtest;
  }
  if (oxVideo.be) {
    oxVideoParams.be = oxVideo.be;
  }

  return oxVideoParams
}

function createVideoBidResponses(response, {bids, startTime}) {
  let bidResponses = [];
  let bid = bids[0];

  if (response !== undefined && response.cache_key !== '') {
    let bidResponse = {};
    bidResponse.requestId = bid.bidId;
    bidResponse.bidderCode = BIDDER_CODE;
    // default 5 mins
    bidResponse.ttl = 300;
    // true is net, false is gross
    bidResponse.netRevenue = true;
    // waiting for this to be exposed
    bidResponse.currency = 'USD';

    if (response.pub_rev) {
      bidResponse.cpm = Number(response.pub_rev) / 1000;
    } else {
      bidResponse.cpm = 0;
    }

    bidResponse.width = bid.sizes[0];
    bidResponse.height = bid.sizes[1];

    bidResponse.openx = {
      ff: response.cache_key,
      oxcolo: response.per_colo_domain,
      oxph: response.ph
    };
    bidResponses.push(bidResponse);
  }

  return bidResponses;
}

registerBidder(spec);
