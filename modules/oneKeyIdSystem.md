# Prebid Addressability Framework (OneKey)

The OneKey real-time data module in Prebid has been built so that publishers
can quickly and easily setup the OneKey Addressability Framework.
This module is used along with the oneKeyRtdProvider to pass OneKey data to your partners.
Both modules are required. This module will pass oneKeyData to your partners
while the oneKeyRtdProvider will pass the transmission requests.

Background information:
- [prebid/addressability-framework](https://github.com/prebid/addressability-framework)
- [prebid/paf-mvp-implementation](https://github.com/prebid/paf-mvp-implementation)

## OneKey Configuration

The oneKeyData module depends on paf-lib.js existing in the page.

Compile the oneKeyData module into your Prebid build.
You will also want to add the oneKeyRtdProvider module as well.

`gulp build --modules=userId,oneKeyIdSystem,rtdModule,oneKeyRtdProvider,appnexusBidAdapter`

There are no custom configuration parameters for OneKey. The module
will retrieve the OneKey data from the page if available and pass the 
information to bidders. Here is a configuration example:

```javascript
pbjs.setConfig({
  userSync: {
      userIds: [{
          name: "oneKeyData",
          params: {}
      }]
    }],
    auctionDelay: 50    // example auction delay, applies to all userId modules
  }
});
```

Bidders will receive the data in the following format:

```json
{
    "identifiers": [{
        "version": "0.1",
        "type": "paf_browser_id",
        "value": "da135b3a-7d04-44bf-a0af-c4709f10420b",
        "source": {
            "domain": "crto-poc-1.onekey.network",
            "timestamp": 1648836556881,
            "signature": "+NF27bBvPM54z103YPExXuS834+ggAQe6JV0jPeGo764vRYiiBl5OmEXlnB7UZgxNe3KBU7rN2jk0SkI4uL0bg=="
        }
    }],
    "preferences": {
        "version": "0.1",
        "data": {
            "use_browsing_for_personalization": true
        },
        "source": {
            "domain": "cmp.pafdemopublisher.com",
            "timestamp": 1648836566468,
            "signature": "ipbYhU8IbSFm2tCqAVYI2d5w4DnGF7Xa2AaiZScx2nmBPLfMmIT/FkBYGitR8Mi791DHtcy5MXr4+bs1aeZFqw=="
        }
    }
}
```


If the bidder elects to use pbjs.getUserIdsAsEids() then the format will be:

```json
"user": {
    "ext": {
        "eids": [{
            "source": "paf",
            "uids": [{
                "id": "da135b3a-7d04-44bf-a0af-c4709f10420b",
                "atype": 1,
                "ext": {
                    "version": "0.1",
                    "type": "paf_browser_id",
                    "source": {
                        "domain": "crto-poc-1.onekey.network",
                        "timestamp": 1648836556881,
                        "signature": "+NF27bBvPM54z103YPExXuS834+ggAQe6JV0jPeGo764vRYiiBl5OmEXlnB7UZgxNe3KBU7rN2jk0SkI4uL0bg=="
                    }
                }
            }],
            "ext": {
                "preferences": {
                    "version": "0.1",
                    "data": {
                        "use_browsing_for_personalization": true
                    },
                    "source": {
                        "domain": "cmp.pafdemopublisher.com",
                        "timestamp": 1648836566468,
                        "signature": "ipbYhU8IbSFm2tCqAVYI2d5w4DnGF7Xa2AaiZScx2nmBPLfMmIT/FkBYGitR8Mi791DHtcy5MXr4+bs1aeZFqw=="
                    }
                }
            }
        }]
    }
}
```