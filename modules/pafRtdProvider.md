## Prebid Addressability Framework Real-time Data Submodule

The PAF real-time data module in Prebid has been built so that publishers
can quickly and easily setup the Prebid Addressability Framework and utilize OneKey.
This module is used along with the pafIdSysytem to pass PAF data to your partners.
Both modules are required. This module will pass transmission requests to your partners
while the pafIdSystem will pass the pafData.

Background information:
https://github.com/prebid/addressability-framework
https://github.com/prebid/paf-mvp-implementation



### Publisher Usage

The paf RTD module depends on paf-lib.js existing in the page.

Compile the paf RTD module into your Prebid build:

`gulp build --modules=userId,pafIdSystem,rtdModule,pafRtdProvider,appnexusBidAdapter`

Add the PAF RTD provider to your Prebid config. In this example we will configure
a sample proxyHostName. See the "Parameter Descriptions" below for more detailed information
of the configuration parameters.

```
pbjs.setConfig(
    ...
    realTimeData: {
        auctionDelay: 5000,
        dataProviders: [
            {
                name: "paf",
                waitForIt: true,
                params: {
                    proxyHostName: "cmp.pafdemopublisher.com"
                }
            }
        ]
    }
    ...
}
```

### Parameter Descriptions for the PAF Configuration Section

| Name  |Type | Description   | Notes  |
| :------------ | :------------ | :------------ |:------------ |
| name | String | Real time data module name | Always 'paf' |
| waitForIt | Boolean | Required to ensure that the auction is delayed until prefetch is complete | Optional. Defaults to false |
| params | Object | | |
| params.proxyHostName | String | URL of the PAF Proxy which will generate seeds. | Required |
| params.bidders | Array | List of bidders to restrict the data to. | Optional |

### Data for bidders

The data will provided to the bidders using the `ortb2` object. You can find the
format of the data at https://github.com/prebid/addressability-framework.
The following is an example of the format of the data:

```json
"user": {
    "ext": {
        "paf": {
            "transmission": {
                "seed": {
                    "version": "0.1",
                    "transaction_ids": ["06df6992-691c-4342-bbb0-66d2a005d5b1", "d2cd0aa7-8810-478c-bd15-fb5bfa8138b8"],
                    "publisher": "cmp.pafdemopublisher.com",
                    "source": {
                        "domain": "cmp.pafdemopublisher.com",
                        "timestamp": 1649712888,
                        "signature": "turzZlXh9IqD5Rjwh4vWR78pKLrVsmwQrGr6fgw8TPgQVJSC8K3HvkypTV7lm3UaCi+Zzjl+9sd7Hrv87gdI8w=="
                    }
                }
            }
        }
    }
}


```json
"ortb2Imp": {
    "ext": {
        "data": {
            "paf": {
                "transaction_id": "52d23fed-4f50-4c17-b07a-c458143e9d09"
            }
        }
    }
}
```