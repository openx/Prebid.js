import { expect } from 'chai';
import { spec } from 'modules/openxvideoBidAdapter';
import { newBidder } from 'src/adapters/bidderFactory';

const URLBASE = '/v/1.0/avjp';

describe('OpenxVideoAdapter', () => {
  const adapter = newBidder(spec);

  describe('inherited functions', () => {
    it('exists and is a function', () => {
      expect(adapter.callBids).to.exist.and.to.be.a('function');
    });
  });

  describe('isBidRequestValid', () => {
    let bid = {
      'bidder': 'openxvideo',
      'params': {
        'unit': '12345678',
        'delDomain': 'test-del-domain',
        'video': {
          'be': 'true',
          'url': 'abc.com',
          'vtest': '1'
        }
      },
      'adUnitCode': 'adunit-code',
      'sizes': [640, 480],
      'bidId': '30b31c1838de1e',
      'bidderRequestId': '22edbae2733bf6',
      'auctionId': '1d1a030790a475',
      'transactionId': '4008d88a-8137-410b-aa35-fbfdabcb478e'
    };

    it('should return true when required params found', () => {
      expect(spec.isBidRequestValid(bid)).to.equal(true);
    });

    it('should return false when required params are not passed', () => {
      let bid = Object.assign({}, bid);
      delete bid.params;
      bid.params = {};
      expect(spec.isBidRequestValid(bid)).to.equal(false);
    });
  });

  describe('buildRequests', () => {
    let bidRequests = [{
      'bidder': 'openxvideo',
      'params': {
        'unit': '12345678',
        'delDomain': 'test-del-domain',
        'video': {
          'be': 'true',
          'url': 'abc.com',
          'vtest': '1'
        }
      },
      'adUnitCode': 'adunit-code',
      'sizes': [640, 480],
      'bidId': '30b31c1838de1e',
      'bidderRequestId': '22edbae2733bf6',
      'auctionId': '1d1a030790a475',
      'transactionId': '4008d88a-8137-410b-aa35-fbfdabcb478e'
    }];

    it('should send bid request to openx url via GET', () => {
      const request = spec.buildRequests(bidRequests);
      expect(request.url).to.equal('http://' + bidRequests[0].params.delDomain + URLBASE);
      expect(request.method).to.equal('GET');
    });

    it('should have the correct parameters', () => {
      const request = spec.buildRequests(bidRequests);
      const dataParams = request.data;

      expect(dataParams.auid).to.exist;
      expect(dataParams.auid).to.equal('12345678');
      expect(dataParams.url).to.exist;
      expect(dataParams.url).to.equal('abc.com');
      expect(dataParams.vtest).to.exist;
      expect(dataParams.vtest).to.equal('1');
    });
  });

  describe('interpretResponse', () => {
    let bids = [{
      'bidder': 'openxvideo',
      'params': {
        'unit': '12345678',
        'delDomain': 'test-del-domain',
        'video': {
          'be': 'true',
          'url': 'abc.com',
          'vtest': '1'
        }
      },
      'adUnitCode': 'adunit-code',
      'sizes': [640, 480],
      'bidId': '30b31c1838de1e',
      'bidderRequestId': '22edbae2733bf6',
      'auctionId': '1d1a030790a475',
      'transactionId': '4008d88a-8137-410b-aa35-fbfdabcb478e'
    }];
    let bidRequest = {
      method: 'GET',
      url: 'url',
      data: {},
      payload: {'bids': bids, 'startTime': new Date()}
    };
    let bidResponse = 'json({"cache_key":"test_cache_key", "pub_rev":"1",' +
      ' "per_colo_domain":"http://delivery-us-west-1.openx.net", "ph":"7a3b9374-7986-4a41-a79d-034193518aee"})';

    it('should return correct bid response', () => {
      let expectedResponse = [
        {
          'requestId': '30b31c1838de1e',
          'bidderCode': '"openxvideo"',
          'cpm': 1,
          'width': '640',
          'height': '480',
          'openx': {
            'ff': 'test_cache_key',
            'oxcolo': 'http://delivery-us-west-1.openx.net',
            'oxph': '7a3b9374-7986-4a41-a79d-034193518aee'
          },
          'ttl': 300,
          'netRevenue': true,
          'currency': 'USD'
        }
      ];

      let result = spec.interpretResponse(bidResponse, bidRequest);
      expect(JSON.stringify(Object.keys(result[0]).sort())).to.eql(JSON.stringify(Object.keys(expectedResponse[0]).sort()));
    });

    it('handles nobid responses', () => {
      bidResponse = 'json({"cache_key":"", "pub_rev":"", "per_colo_domain":"", "ph":""})';
      let result = spec.interpretResponse(bidResponse, bidRequest);
      expect(result.length).to.equal(0);
    });
  });
});
