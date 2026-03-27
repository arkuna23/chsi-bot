const PROVINCE_ALIASES: Record<string, { zh: string; en: string }> = {
  beijing: { zh: '北京', en: 'Beijing' },
  北京: { zh: '北京', en: 'Beijing' },
  tianjin: { zh: '天津', en: 'Tianjin' },
  天津: { zh: '天津', en: 'Tianjin' },
  hebei: { zh: '河北', en: 'Hebei' },
  河北: { zh: '河北', en: 'Hebei' },
  shanxi: { zh: '山西', en: 'Shanxi' },
  山西: { zh: '山西', en: 'Shanxi' },
  neimenggu: { zh: '内蒙古', en: 'Inner Mongolia' },
  innermongolia: { zh: '内蒙古', en: 'Inner Mongolia' },
  内蒙古: { zh: '内蒙古', en: 'Inner Mongolia' },
  liaoning: { zh: '辽宁', en: 'Liaoning' },
  辽宁: { zh: '辽宁', en: 'Liaoning' },
  jilin: { zh: '吉林', en: 'Jilin' },
  吉林: { zh: '吉林', en: 'Jilin' },
  heilongjiang: { zh: '黑龙江', en: 'Heilongjiang' },
  黑龙江: { zh: '黑龙江', en: 'Heilongjiang' },
  shanghai: { zh: '上海', en: 'Shanghai' },
  上海: { zh: '上海', en: 'Shanghai' },
  jiangsu: { zh: '江苏', en: 'Jiangsu' },
  江苏: { zh: '江苏', en: 'Jiangsu' },
  zhejiang: { zh: '浙江', en: 'Zhejiang' },
  浙江: { zh: '浙江', en: 'Zhejiang' },
  anhui: { zh: '安徽', en: 'Anhui' },
  安徽: { zh: '安徽', en: 'Anhui' },
  fujian: { zh: '福建', en: 'Fujian' },
  福建: { zh: '福建', en: 'Fujian' },
  jiangxi: { zh: '江西', en: 'Jiangxi' },
  江西: { zh: '江西', en: 'Jiangxi' },
  shandong: { zh: '山东', en: 'Shandong' },
  山东: { zh: '山东', en: 'Shandong' },
  henan: { zh: '河南', en: 'Henan' },
  河南: { zh: '河南', en: 'Henan' },
  hubei: { zh: '湖北', en: 'Hubei' },
  湖北: { zh: '湖北', en: 'Hubei' },
  hunan: { zh: '湖南', en: 'Hunan' },
  湖南: { zh: '湖南', en: 'Hunan' },
  guangdong: { zh: '广东', en: 'Guangdong' },
  广东: { zh: '广东', en: 'Guangdong' },
  guangxi: { zh: '广西', en: 'Guangxi' },
  广西: { zh: '广西', en: 'Guangxi' },
  hainan: { zh: '海南', en: 'Hainan' },
  海南: { zh: '海南', en: 'Hainan' },
  chongqing: { zh: '重庆', en: 'Chongqing' },
  重庆: { zh: '重庆', en: 'Chongqing' },
  sichuan: { zh: '四川', en: 'Sichuan' },
  四川: { zh: '四川', en: 'Sichuan' },
  guizhou: { zh: '贵州', en: 'Guizhou' },
  贵州: { zh: '贵州', en: 'Guizhou' },
  yunnan: { zh: '云南', en: 'Yunnan' },
  云南: { zh: '云南', en: 'Yunnan' },
  xizang: { zh: '西藏', en: 'Tibet' },
  tibet: { zh: '西藏', en: 'Tibet' },
  西藏: { zh: '西藏', en: 'Tibet' },
  shaanxi: { zh: '陕西', en: 'Shaanxi' },
  陕西: { zh: '陕西', en: 'Shaanxi' },
  gansu: { zh: '甘肃', en: 'Gansu' },
  甘肃: { zh: '甘肃', en: 'Gansu' },
  qinghai: { zh: '青海', en: 'Qinghai' },
  青海: { zh: '青海', en: 'Qinghai' },
  ningxia: { zh: '宁夏', en: 'Ningxia' },
  宁夏: { zh: '宁夏', en: 'Ningxia' },
  xinjiang: { zh: '新疆', en: 'Xinjiang' },
  新疆: { zh: '新疆', en: 'Xinjiang' },
};

const PROVINCE_CODES: Record<string, string> = {
  '11': '北京',
  '12': '天津',
  '13': '河北',
  '14': '山西',
  '15': '内蒙古',
  '21': '辽宁',
  '22': '吉林',
  '23': '黑龙江',
  '31': '上海',
  '32': '江苏',
  '33': '浙江',
  '34': '安徽',
  '35': '福建',
  '36': '江西',
  '37': '山东',
  '41': '河南',
  '42': '湖北',
  '43': '湖南',
  '44': '广东',
  '45': '广西',
  '46': '海南',
  '50': '重庆',
  '51': '四川',
  '52': '贵州',
  '53': '云南',
  '54': '西藏',
  '61': '陕西',
  '62': '甘肃',
  '63': '青海',
  '64': '宁夏',
  '65': '新疆',
};

function normalizeKey(input: string): string {
  return input.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function normalizeProvinceInput(input: string): string {
  const direct = PROVINCE_ALIASES[input.trim()];
  if (direct) {
    return direct.zh;
  }

  const normalized = PROVINCE_ALIASES[normalizeKey(input)];
  if (!normalized) {
    throw new Error(`unknown province: ${input}`);
  }

  return normalized.zh;
}

export function normalizeProvinceCode(input: string): string | null {
  return PROVINCE_CODES[input] ?? null;
}

export function toEnglishProvince(input: string): string {
  const normalized = normalizeProvinceInput(input);
  return PROVINCE_ALIASES[normalized].en;
}
