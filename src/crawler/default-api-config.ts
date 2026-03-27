import type { ChsiApiConfig } from '../types/domain';

export const DEFAULT_CHSI_API_CONFIG: ChsiApiConfig = {
  queryUrl: 'https://yz.chsi.com.cn/sytj/stu/tjyxqexxcx.action',
  method: 'POST',
  bodyType: 'form',
  responseType: 'json',
  staticParams: {
    mhcx: '1',
    ssdm2: '',
    dwmc2: '',
    zxjh2: '',
    xxfs2: '',
    fhbktj: 'false',
  },
  prefixParam: 'mldm2',
  pageParam: 'start',
  pageSizeParam: 'pageSize',
  pageSize: 100,
  discoveredAt: '2026-03-27T00:00:00.000Z',
};
