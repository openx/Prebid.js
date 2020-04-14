import { expect } from 'chai';
import openxAdapterParams from 'modules/openxAnalyticsAdapter.js';
import { config } from 'src/config.js';
import events from 'src/events.js';
import CONSTANTS from 'src/constants.json';
import * as utils from 'src/utils.js';
import { server } from 'test/mocks/xhr.js';

const {
  EVENTS: { AUCTION_INIT, BID_REQUESTED, BID_RESPONSE, BID_TIMEOUT, BID_WON, AUCTION_END }
} = CONSTANTS;
const SLOT_LOADED = 'slotOnload';

const zlib = require('zlib');
const openxAdapter = openxAdapterParams.adapter;

describe('openx analytics adapter', function() {
  it.skip('should require publisher id', function() {
    sinon.spy(utils, 'logError');

    openxAdapter.enableAnalytics();
    expect(
      utils.logError.calledWith(
        'OpenX analytics adapter: publisherId is required.'
      )
    ).to.be.true;

    utils.logError.restore();
  });

  describe('sending analytics event', function() {
    const auctionInit = { auctionId: 'add5eb0f-587d-441d-86ec-bbb722c70f79' };

    const auctionId = 'add5eb0f-587d-441d-86ec-bbb722c70f79';
    const OPENX_ADID = '33dddbb61d359a';
    const ADUNITCODE1 = 'div-1';
    const AUCTION_END_WAIT_TIME = openxAdapterParams.auctionEndWaitTime;
    const SLOT_LOAD_WAIT_TIME = 200;

    let clock;
    before(function () {
      clock = sinon.useFakeTimers();
    });
    after(function () {
      clock.restore();
    });

    const openxAdUnitInfo = {'code': 'div-1',
      'mediaTypes': {'banner': {'sizes': [[320, 50]]}},
      'bids': [{'bidder': 'openx',
        'params': {'unit': '540249866', 'delDomain': 'sademo-d.openx.net'}}],
      'sizes': [[320, 50]],
      'transactionId': 'ac66c3e6-3118-4213-a3ae-8cdbe4f72873'};

    const bidRequestedOpenX = {
      auctionId: 'add5eb0f-587d-441d-86ec-bbb722c70f79',
      auctionStart: 1540944528017,
      bids: [
        {
          adUnitCode: 'div-1',
          bidId: '2f0c647b904e25',
          bidder: 'openx',
          params: { unit: '540249866' },
          transactionId: 'ac66c3e6-3118-4213-a3ae-8cdbe4f72873'
        }
      ],
      start: 1540944528021
    };

    const bidRequestedCloseX = {
      auctionId: 'add5eb0f-587d-441d-86ec-bbb722c70f79',
      auctionStart: 1540944528017,
      bids: [
        {
          adUnitCode: 'div-1',
          bidId: '43d454020e9409',
          bidder: 'closex',
          params: { unit: '513144370' },
          transactionId: 'ac66c3e6-3118-4213-a3ae-8cdbe4f72873'
        }
      ],
      start: 1540944528026
    };

    const bidResponseOpenX = {
      requestId: '2f0c647b904e25',
      adId: '33dddbb61d359a',
      adUnitCode: 'div-1',
      auctionId: 'add5eb0f-587d-441d-86ec-bbb722c70f79',
      cpm: 0.5,
      creativeId: 'openx-crid',
      responseTimestamp: 1540944528184,
      ts: '2DAABBgABAAECAAIBAAsAAgAAAJccGApKSGt6NUZxRXYyHBbinsLj'
    };

    const bidResponseCloseX = {
      requestId: '43d454020e9409',
      adId: '43dddbb61d359a',
      adUnitCode: 'div-1',
      auctionId: 'add5eb0f-587d-441d-86ec-bbb722c70f79',
      cpm: 0.3,
      creativeId: 'closex-crid',
      responseTimestamp: 1540944528196,
      ts: 'hu1QWo6iD3MHs6NG_AQAcFtyNqsj9y4S0YRbX7Kb06IrGns0BABb'
    };

    const emptyBidResponses = {};

    const bidTimeoutOpenX = {
      0: {
        adUnitCode: 'div-1',
        auctionId: 'add5eb0f-587d-441d-86ec-bbb722c70f79',
        bidId: '2f0c647b904e25'
      }
    };

    const bidTimeoutCloseX = {
      0: {
        adUnitCode: 'div-1',
        auctionId: 'add5eb0f-587d-441d-86ec-bbb722c70f79',
        bidId: '43d454020e9409'
      }
    };

    const bidWonOpenX = {
      requestId: '2f0c647b904e25',
      adId: '33dddbb61d359a',
      adUnitCode: 'div-1',
      auctionId: 'add5eb0f-587d-441d-86ec-bbb722c70f79'
    };

    const bidWonCloseX = {
      requestId: '43d454020e9409',
      adId: '43dddbb61d359a',
      adUnitCode: 'div-1',
      auctionId: 'add5eb0f-587d-441d-86ec-bbb722c70f79'
    };

    const auctionEnd = {
      'auctionId': 'add5eb0f-587d-441d-86ec-bbb722c70f79',
      'timestamp': 1540944528017,
      'auctionEnd': 1540944528117,
      'auctionStatus': 'completed',
      'adUnits': openxAdUnitInfo,
      'adUnitCodes': [
        'div-1'
      ],
      'bidderRequests': [bidRequestedOpenX],
      'noBids': [],
      'bidsReceived': [bidResponseOpenX],
      'winningBids': [],
      'timeout': 300
    };

    const slotLoadDFPWin = {
      slot: {
        getAdUnitPath: () => {
          return '/90577858/test_ad_unit';
        },
        getSlotElementId: function () {
          return 'div-1';
        },
        getTargetingKeys: () => {
          return [];
        },
        getTargeting: () => {
          return []; // sinon.stub().withArgs('hb_adid').returns(highestBid ? [highestBid.adId] : [])
        }
      }
    };

    function simulateAuction(events) {
      let highestBid;

      events.forEach(event => {
        const [eventType, args] = event;
        openxAdapter.track({ eventType, args });
        if (eventType === BID_RESPONSE) {
          highestBid = highestBid || args;
          if (highestBid.cpm < args.cpm) {
            highestBid = args;
          }
        } else if (eventType === SLOT_LOADED) {
          openxAdapter.slotOnLoad(args);
        }
      });
    }

    function getQueryData(url) {
      const queryArgs = url.split('?')[1].split('&');
      return queryArgs.reduce((data, arg) => {
        const [key, val] = arg.split('=');
        data[key] = val;
        return data;
      }, {});
    }

    before(function() {
      sinon.stub(events, 'getEvents').returns([]);
      openxAdapter.enableAnalytics({
        provider: 'openx',
        options: {
          publisherPlatformId: 'a3aece0c-9e80-4316-8deb-faf804779bd1',
          publisherAccountId: 537143056,
          sampling: 1.0,
          testCode: 'test-code-1',
          slotLoadWaitTime: SLOT_LOAD_WAIT_TIME
        }
      });
    });

    after(function() {
      events.getEvents.restore();
      openxAdapter.disableAnalytics();
    });

    beforeEach(function() {
      openxAdapter.reset();
    });

    afterEach(function() {});

    it.skip('should not send request if no bid response', function() {
      simulateAuction([
        [AUCTION_INIT, auctionInit],
        [BID_REQUESTED, bidRequestedOpenX]
      ]);

      expect(server.requests.length).to.equal(0);
    });

    it.skip('should send 1 request to the right endpoint', function() {
      simulateAuction([
        [AUCTION_INIT, auctionInit],
        [BID_REQUESTED, bidRequestedOpenX],
        [BID_RESPONSE, bidResponseOpenX]
      ]);

      expect(server.requests.length).to.equal(1);

      const endpoint = server.requests[0].url.split('?')[0];
      // note IE11 returns the default secure port, so we look for this alternate value as well in these tests
      expect(endpoint).to.be.oneOf(['https://ads.openx.net/w/1.0/pban', 'https://ads.openx.net:443/w/1.0/pban']);
    });

    describe('hb.ct, hb.rid, dddid, hb.asiid, hb.pubid', function() {
      it.skip('should always be in the query string', function() {
        simulateAuction([
          [AUCTION_INIT, auctionInit],
          [BID_REQUESTED, bidRequestedOpenX],
          [BID_RESPONSE, bidResponseOpenX]
        ]);

        const queryData = getQueryData(server.requests[0].url);
        expect(queryData).to.include({
          'hb.ct': String(bidRequestedOpenX.auctionStart),
          'hb.rid': auctionInit.auctionId,
          dddid: bidRequestedOpenX.bids[0].transactionId,
          'hb.asiid': '/90577858/test_ad_unit',
          'hb.pubid': 'test123'
        });
      });
    });

    describe('hb.cur', function() {
      it.skip('should be in the query string if currency is set', function() {
        sinon
          .stub(config, 'getConfig')
          .withArgs('currency.adServerCurrency')
          .returns('bitcoin');

        simulateAuction([
          [AUCTION_INIT, auctionInit],
          [BID_REQUESTED, bidRequestedOpenX],
          [BID_RESPONSE, bidResponseOpenX]
        ]);

        config.getConfig.restore();

        const queryData = getQueryData(server.requests[0].url);
        expect(queryData).to.include({
          'hb.cur': 'bitcoin'
        });
      });

      it.skip('should not be in the query string if currency is not set', function() {
        simulateAuction([
          [AUCTION_INIT, auctionInit],
          [BID_REQUESTED, bidRequestedOpenX],
          [BID_RESPONSE, bidResponseOpenX]
        ]);

        const queryData = getQueryData(server.requests[0].url);
        expect(queryData).to.not.have.key('hb.cur');
      });
    });

    describe('hb.dcl, hb.dl, hb.tta, hb.ttr', function() {
      it.skip('should be in the query string if browser supports performance API', function() {
        const timing = {
          fetchStart: 1540944528000,
          domContentLoadedEventEnd: 1540944528010,
          loadEventEnd: 1540944528110
        };
        const originalPerf = window.top.performance;
        window.top.performance = { timing };

        const renderTime = 1540944528100;
        sinon.stub(Date, 'now').returns(renderTime);

        simulateAuction([
          [AUCTION_INIT, auctionInit],
          [BID_REQUESTED, bidRequestedOpenX],
          [BID_RESPONSE, bidResponseOpenX]
        ]);

        window.top.performance = originalPerf;
        Date.now.restore();

        const queryData = getQueryData(server.requests[0].url);
        expect(queryData).to.include({
          'hb.dcl': String(timing.domContentLoadedEventEnd - timing.fetchStart),
          'hb.dl': String(timing.loadEventEnd - timing.fetchStart),
          'hb.tta': String(bidRequestedOpenX.auctionStart - timing.fetchStart),
          'hb.ttr': String(renderTime - timing.fetchStart)
        });
      });

      it.skip('should not be in the query string if browser does not support performance API', function() {
        const originalPerf = window.top.performance;
        window.top.performance = undefined;

        simulateAuction([
          [AUCTION_INIT, auctionInit],
          [BID_REQUESTED, bidRequestedOpenX],
          [BID_RESPONSE, bidResponseOpenX]
        ]);

        window.top.performance = originalPerf;

        const queryData = getQueryData(server.requests[0].url);
        expect(queryData).to.not.have.keys(
          'hb.dcl',
          'hb.dl',
          'hb.tta',
          'hb.ttr'
        );
      });
    });

    describe('ts, auid', function() {
      it.skip('OpenX is in auction and has a bid response', function() {
        simulateAuction([
          [AUCTION_INIT, auctionInit],
          [BID_REQUESTED, bidRequestedOpenX],
          [BID_REQUESTED, bidRequestedCloseX],
          [BID_RESPONSE, bidResponseOpenX],
          [BID_RESPONSE, bidResponseCloseX]
        ]);

        const queryData = getQueryData(server.requests[0].url);
        expect(queryData).to.include({
          ts: bidResponseOpenX.ts,
          auid: bidRequestedOpenX.bids[0].params.unit
        });
      });

      it.skip('OpenX is in auction but no bid response', function() {
        simulateAuction([
          [AUCTION_INIT, auctionInit],
          [BID_REQUESTED, bidRequestedOpenX],
          [BID_REQUESTED, bidRequestedCloseX],
          [BID_RESPONSE, bidResponseCloseX]
        ]);

        const queryData = getQueryData(server.requests[0].url);
        expect(queryData).to.include({
          auid: bidRequestedOpenX.bids[0].params.unit
        });
        expect(queryData).to.not.have.key('ts');
      });

      it.skip('OpenX is not in auction', function() {
        simulateAuction([
          [AUCTION_INIT, auctionInit],
          [BID_REQUESTED, bidRequestedCloseX],
          [BID_RESPONSE, bidResponseCloseX]
        ]);

        const queryData = getQueryData(server.requests[0].url);
        expect(queryData).to.not.have.keys('auid', 'ts');
      });
    });

    describe('hb.exn, hb.sts, hb.ets, hb.bv, hb.crid, hb.to', function() {
      it.skip('2 bidders in auction', function() {
        simulateAuction([
          [AUCTION_INIT, auctionInit],
          [BID_REQUESTED, bidRequestedOpenX],
          [BID_REQUESTED, bidRequestedCloseX],
          [BID_RESPONSE, bidResponseOpenX],
          [BID_RESPONSE, bidResponseCloseX]
        ]);

        const queryData = getQueryData(server.requests[0].url);
        const auctionStart = bidRequestedOpenX.auctionStart;
        expect(queryData).to.include({
          'hb.exn': [
            bidRequestedOpenX.bids[0].bidder,
            bidRequestedCloseX.bids[0].bidder
          ].join(','),
          'hb.sts': [
            bidRequestedOpenX.start - auctionStart,
            bidRequestedCloseX.start - auctionStart
          ].join(','),
          'hb.ets': [
            bidResponseOpenX.responseTimestamp - auctionStart,
            bidResponseCloseX.responseTimestamp - auctionStart
          ].join(','),
          'hb.bv': [bidResponseOpenX.cpm, bidResponseCloseX.cpm].join(','),
          'hb.crid': [
            bidResponseOpenX.creativeId,
            bidResponseCloseX.creativeId
          ].join(','),
          'hb.to': [false, false].join(',')
        });
      });

      it.skip('OpenX timed out', function() {
        simulateAuction([
          [AUCTION_INIT, auctionInit],
          [BID_REQUESTED, bidRequestedOpenX],
          [BID_REQUESTED, bidRequestedCloseX],
          [BID_RESPONSE, bidResponseCloseX],
          [BID_TIMEOUT, bidTimeoutOpenX]
        ]);

        const queryData = getQueryData(server.requests[0].url);
        const auctionStart = bidRequestedOpenX.auctionStart;
        expect(queryData).to.include({
          'hb.exn': [
            bidRequestedOpenX.bids[0].bidder,
            bidRequestedCloseX.bids[0].bidder
          ].join(','),
          'hb.sts': [
            bidRequestedOpenX.start - auctionStart,
            bidRequestedCloseX.start - auctionStart
          ].join(','),
          'hb.ets': [
            undefined,
            bidResponseCloseX.responseTimestamp - auctionStart
          ].join(','),
          'hb.bv': [0, bidResponseCloseX.cpm].join(','),
          'hb.crid': [undefined, bidResponseCloseX.creativeId].join(','),
          'hb.to': [true, false].join(',')
        });
      });
    });

    describe('hb.we, hb.g1', function() {
      it('OpenX won', function() {
        simulateAuction([
          [AUCTION_INIT, auctionInit],
          [BID_REQUESTED, bidRequestedOpenX],
          [BID_RESPONSE, bidResponseOpenX],
          [BID_WON, bidWonOpenX],
          [AUCTION_END, auctionEnd]
        ]);

        // Handle timeouts
        clock.tick(AUCTION_END_WAIT_TIME + 10);

        let compressedPayload = server.requests[0].requestBody;
        let payloadBuffer = new Buffer(compressedPayload);
        let unCompressedPayload = zlib.gunzipSync(payloadBuffer).toString();
        let auctionData = JSON.parse(unCompressedPayload);

        let biddersRequests = [];
        let biddersResponded = [];
        auctionData.events.forEach(function (event) {
          if (event.eventType === AUCTION_END) {
            event.args.bidderRequests.forEach(function(bidRequestInfo) {
              if (bidRequestInfo.bids.length > 0) {
                biddersRequests.push(bidRequestInfo.bids[0].bidder);
              }
            });
            event.args.bidsReceived.forEach(function(bidsInfo) {
              biddersResponded.push(bidsInfo);
            });
          }
        });

        expect(biddersRequests.length).to.equal(1);
        expect(biddersRequests[0]).to.equal('openx');
        expect(biddersResponded.length).to.equal(1);
        expect(biddersResponded[0]).to.include({
          creativeId: 'openx-crid',
          cpm: 0.5
        });

        let bidWonEventInfoList = auctionData.events.filter(function (event) {
          return event.eventType === BID_WON && event.args.auctionId === auctionId;
        });

        expect(bidWonEventInfoList.length).to.equal(1);
        expect(bidWonEventInfoList[0].args).to.include({
          'adId': OPENX_ADID,
          'adUnitCode': ADUNITCODE1
        });

        /* const queryData = getQueryData(server.requests[0].url);
        expect(queryData).to.include({
          'hb.we': '0',
          'hb.g1': 'false'
        }); */
      });

      it('DFP won', function() {
        simulateAuction([
          [AUCTION_INIT, auctionInit],
          [BID_REQUESTED, bidRequestedOpenX],
          [BID_RESPONSE, bidResponseOpenX],
          [AUCTION_END, auctionEnd],
          [SLOT_LOADED, slotLoadDFPWin]
        ]);

        // Handle timeouts
        clock.tick(SLOT_LOAD_WAIT_TIME + 10);

        let compressedPayload = server.requests[0].requestBody;
        let payloadBuffer = new Buffer(compressedPayload);
        let unCompressedPayload = zlib.gunzipSync(payloadBuffer).toString();
        let auctionData = JSON.parse(unCompressedPayload);

        let biddersRequests = [];
        let biddersResponded = [];
        auctionData.events.forEach(function (event) {
          if (event.eventType === AUCTION_END) {
            event.args.bidderRequests.forEach(function(bidRequestInfo) {
              if (bidRequestInfo.bids.length > 0) {
                biddersRequests.push(bidRequestInfo.bids[0].bidder);
              }
            });
            event.args.bidsReceived.forEach(function(bidsInfo) {
              biddersResponded.push(bidsInfo);
            });
          }
        });

        expect(biddersRequests.length).to.equal(1);
        expect(biddersRequests[0]).to.equal('openx');
        expect(biddersResponded.length).to.equal(1);

        let bidWonEventInfoList = auctionData.events.filter(function (event) {
          return event.eventType === BID_WON && event.args.auctionId === auctionId;
        });

        expect(bidWonEventInfoList.length).to.equal(0);

        /* const queryData = getQueryData(server.requests[0].url);
        expect(queryData).to.include({
          'hb.we': '-1',
          'hb.g1': 'true'
        }); */
      });
    });
  });
});
