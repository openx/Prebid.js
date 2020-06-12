import {openAudienceSubmodule} from 'modules/openAudienceIdSystem.js';
import * as utils from 'src/utils.js';
import {server} from 'test/mocks/xhr.js';

const PUBLISHER_ID = 'test-pub-id';
const defaultConfigParams = {publisherId: PUBLISHER_ID};
const responseHeader = {'Content-Type': 'application/json'};

describe('OpenAudienceId tests', function () {
  let logErrorStub;

  beforeEach(function () {
    logErrorStub = sinon.stub(utils, 'logError');
  });

  afterEach(function () {
    logErrorStub.restore();
  });

  it('should log an error if no configParams were passed when getId', function () {
    openAudienceSubmodule.getId();
    expect(logErrorStub.calledOnce).to.be.true;
  });

  it('should log an error if pid configParam was not passed when getId', function () {
    openAudienceSubmodule.getId({});
    expect(logErrorStub.calledOnce).to.be.true;
  });

  it('should call the OpenAudience endpoint', function () {
    let callBackSpy = sinon.spy();
    let submoduleCallback = openAudienceSubmodule.getId(defaultConfigParams).callback;
    submoduleCallback(callBackSpy);
    let request = server.requests[0];
    expect(request.url).to.be.eq(`https://openaudience.openx.org?publisher_id=${PUBLISHER_ID}`);
    request.respond(
      200,
      responseHeader,
      JSON.stringify({})
    );
    expect(callBackSpy.calledOnce).to.be.true;
  });

  it('should call the OpenAudience endpoint with consent string', function () {
    let callBackSpy = sinon.spy();
    let consentData = {
      gdprApplies: true,
      consentString: 'BOkIpDSOkIpDSADABAENCc-AAAApOAFAAMAAsAMIAcAA_g'
    };
    let submoduleCallback = openAudienceSubmodule.getId(defaultConfigParams, consentData).callback;
    submoduleCallback(callBackSpy);
    let request = server.requests[0];
    expect(request.url).to.be.eq(`https://openaudience.openx.org?publisher_id=${PUBLISHER_ID}&gdpr=1&gdpr_consent=${consentData.consentString}`);
    request.respond(
      200,
      responseHeader,
      JSON.stringify({})
    );
    expect(callBackSpy.calledOnce).to.be.true;
  });

  it('should not throw Uncaught TypeError when endpoint returns empty response', function () {
    let callBackSpy = sinon.spy();
    let submoduleCallback = openAudienceSubmodule.getId(defaultConfigParams).callback;
    submoduleCallback(callBackSpy);
    let request = server.requests[0];
    expect(request.url).to.be.eq(`https://openaudience.openx.org?publisher_id=${PUBLISHER_ID}`);
    request.respond(
      204,
      responseHeader,
      ''
    );
    expect(callBackSpy.calledOnce).to.be.true;
    expect(request.response).to.equal('');
    expect(logErrorStub.calledOnce).to.not.be.true;
  });

  it('should log an error and continue to callback if ajax request errors', function () {
    let callBackSpy = sinon.spy();
    let submoduleCallback = openAudienceSubmodule.getId(defaultConfigParams).callback;
    submoduleCallback(callBackSpy);
    let request = server.requests[0];
    expect(request.url).to.be.eq(`https://openaudience.openx.org?publisher_id=${PUBLISHER_ID}`);
    request.respond(
      503,
      responseHeader,
      'Unavailable'
    );
    expect(logErrorStub.calledOnce).to.be.true;
    expect(callBackSpy.calledOnce).to.be.true;
  });
});
