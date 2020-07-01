import {openAudienceSubmodule, OA_URL} from 'modules/openAudienceIdSystem.js';
import * as utils from 'src/utils.js';
import {server} from 'test/mocks/xhr.js';
import {uspDataHandler} from 'src/adapterManager';

const RESOURCE_ID = 'test-resource-id';
const DEFAULT_CONFIG = {resourceId: RESOURCE_ID};
const responseHeader = {'Content-Type': 'application/json'};

describe('OpenAudienceId tests', function () {
  let logErrorStub;

  beforeEach(function () {
    logErrorStub = sinon.stub(utils, 'logError');
  });

  afterEach(function () {
    logErrorStub.restore();
  });

  describe('getId()', function () {
    let callbackSpy;
    let getIdsSpy;
    let mockedGetConsentData;

    beforeEach(function () {
      mockedGetConsentData = sinon.stub(uspDataHandler, 'getConsentData');
    });

    afterEach(function () {
      mockedGetConsentData.restore();
    });

    it('should log an error if no configParams were passed when getId', function () {
      openAudienceSubmodule.getId();
      expect(logErrorStub.calledOnce).to.be.true;
    });

    context('when oa.js is available', function () {
      beforeEach(function () {
        callbackSpy = sinon.spy();
        getIdsSpy = sinon.spy();

        window.oajs = {
          getIds: getIdsSpy
        };
      });

      afterEach(function () {
        delete window.oajs;
      });

      it('should call the OpenAudience endpoint', function () {
        let submoduleCallback = openAudienceSubmodule.getId(DEFAULT_CONFIG).callback;
        submoduleCallback(callbackSpy);

        expect(getIdsSpy.calledOnce).to.be.true;
        expect(getIdsSpy.getCall(0).args[0]).to.be.an.instanceof(Function);
      });
    });

    context('when oa.js is not available', function () {
      beforeEach(function () {
        callbackSpy = sinon.spy();
      });

      it('should call the OpenAudience endpoint', function () {
        let submoduleCallback = openAudienceSubmodule.getId(DEFAULT_CONFIG).callback;
        submoduleCallback(callbackSpy);

        let request = server.requests[0];
        expect(request.url).to.have.string(OA_URL);
      });

      it('should send the resource id', function () {
        let submoduleCallback = openAudienceSubmodule.getId(DEFAULT_CONFIG).callback;
        submoduleCallback(callbackSpy);

        let request = server.requests[0];
        expect(request.url).to.have.string(`rid=${RESOURCE_ID}`);
      });

      it('should include GDRP parameters, if exists', function () {
        let gdprObject = {
          gdprApplies: true,
          consentString: 'test-consent-string'
        }
        let submoduleCallback = openAudienceSubmodule.getId(DEFAULT_CONFIG, gdprObject).callback;
        submoduleCallback(callbackSpy);

        let request = server.requests[0];
        expect(request.url).to.have.string('gdpr=1');
        expect(request.url).to.have.string(`gdpr_consent=${gdprObject.consentString}`);
      });

      it('should include US privacy parameter, if exists', function () {
        mockedGetConsentData.returns('1YNY');
        let submoduleCallback = openAudienceSubmodule.getId(DEFAULT_CONFIG).callback;
        submoduleCallback(callbackSpy);

        let request = server.requests[0];
        expect(request.url).to.have.string('us_privacy=1YNY');
      });

      it('should not throw Uncaught TypeError when endpoint returns empty response', function () {
        let submoduleCallback = openAudienceSubmodule.getId(DEFAULT_CONFIG).callback;
        submoduleCallback(callbackSpy);
        let request = server.requests[0];
        request.respond(
          204,
          responseHeader,
          ''
        );
        expect(callbackSpy.getCall(0).args[0]).to.be.undefined;
      });

      it('should log an error and continue to callback if ajax request errors', function () {
        let submoduleCallback = openAudienceSubmodule.getId(DEFAULT_CONFIG).callback;
        submoduleCallback(callbackSpy);
        let request = server.requests[0];
        request.respond(
          503,
          responseHeader,
          'Unavailable'
        );
        expect(logErrorStub.calledOnce).to.be.true;
        expect(callbackSpy.getCall(0).args[0]).to.be.undefined;
      });
    });
  });
});
