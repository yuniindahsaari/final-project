const REMOTE_MANAGEMENT_ENDPOINT = 'wss://remote-mgmt.edgeimpulse.com';
const INGESTION_API = 'https://ingestion.edgeimpulse.com';
const STUDIO_ENDPOINT = 'https://studio.edgeimpulse.com';
const LS_API_KEY = 'apiKey';
const LS_KEYWORD = 'keyword';
const LS_SAMPLE_LENGTH = 'sampleLength';
const LS_FREQUENCY = 'frequency';
const LS_DEVICE_ID_KEY = 'deviceId';
const LS_INGESTION_API = 'ingestionApi';
const LS_REMOTE_MANAGEMENT_ENDPOINT = 'remoteMgmtEndpoint';
const LS_STUDIO_ENDPOINT = 'studioEndpoint';

// konek edge impulse dengan api key

const getRandomString = () =>
    Date.now().toString(36);

export const getApiKey = () =>
    new URLSearchParams(window.location.search).get('apiKey') ||
    localStorage.getItem(LS_API_KEY) ||
    'ei_e0050bfeee3ce81e23ec498be73a5caf7ac8aa388c1ddc1fbed936f3a7a15ffd';
export const storeApiKey = (apiKey: string) => {
    console.log('storeApiKey', apiKey, window.location.search);
    localStorage.setItem(LS_API_KEY, apiKey);
};

// konek edge impulse dengan api key


export const getKeyword = () =>
    new URLSearchParams(window.location.search).get('keyword') ||
    localStorage.getItem(LS_KEYWORD) ||
    '';
export const storeKeyword = (keyword: string) => {
    console.log('storeKeyword', keyword, window.location.search);
    localStorage.setItem(LS_KEYWORD, keyword);
};

export const getFrequency = () =>
    Number(new URLSearchParams(window.location.search).get('frequency')) ||
    Number(localStorage.getItem(LS_FREQUENCY)) ||
    NaN;
export const storeFrequency = (frequency: number) => {
    console.log('storeFrequency', frequency, window.location.search);
    localStorage.setItem(LS_FREQUENCY, frequency.toString());
};

export const getSampleLength = () =>
    Number(new URLSearchParams(window.location.search).get('sampleLength')) ||
    Number(localStorage.getItem(LS_SAMPLE_LENGTH)) ||
    NaN;
export const storeSampleLength = (sampleLength: number) => {
    console.log('storeSampleLength', sampleLength, window.location.search);
    localStorage.setItem(LS_SAMPLE_LENGTH, sampleLength.toString());
};

const isMobilePhone = (navigator.maxTouchPoints || 'ontouchstart' in document.documentElement);
const devicePrefix = isMobilePhone ? 'phone' : 'computer';

export const getDeviceId = () =>
    localStorage.getItem(LS_DEVICE_ID_KEY) || `${devicePrefix}_${getRandomString()}`;
export const storeDeviceId = (deviceId: string) => {
    localStorage.setItem(LS_DEVICE_ID_KEY, deviceId);
};

export const getIngestionApi = () => {
    let ingestionApiParam = new URLSearchParams(window.location.search).get('ingestionApi')
    let envParam = new URLSearchParams(window.location.search).get('env')
    let localStorageParam = localStorage.getItem(LS_INGESTION_API)
    if (ingestionApiParam) {
        return ingestionApiParam;
    } else if (envParam) {
        return "http://ingestion." + envParam + ".test.edgeimpulse.com"
    } else if (localStorageParam) {
        return localStorageParam
    } else {
        if (window.location.host === 'smartphone.acc2.edgeimpulse.com') {
            return INGESTION_API.replace('edgeimpulse.com', 'acc2.edgeimpulse.com')
        } else {
            return INGESTION_API
        }
    }
}

export const storeIngestionApi = (ingestionApi: string) => {
    console.log('storeIngestionApi', ingestionApi);
    localStorage.setItem(LS_INGESTION_API, ingestionApi);
};

export const getRemoteManagementEndpoint = () => {
    let remoteMgmtParam = new URLSearchParams(window.location.search).get('remoteManagement')
    let envParam = new URLSearchParams(window.location.search).get('env')
    let localStorageParam = localStorage.getItem(LS_REMOTE_MANAGEMENT_ENDPOINT)
    if (remoteMgmtParam) {
        return remoteMgmtParam;
    } else if (envParam) {
        return "ws://remote-mgmt." + envParam + ".test.edgeimpulse.com"
    } else if (localStorageParam) {
        return localStorageParam
    } else {
        if (window.location.host === 'smartphone.acc2.edgeimpulse.com') {
            return REMOTE_MANAGEMENT_ENDPOINT.replace('edgeimpulse.com', 'acc2.edgeimpulse.com')
        } else {
            return REMOTE_MANAGEMENT_ENDPOINT
        }
    }
}

export const storeRemoteManagementEndpoint = (remoteManagementEndpoint: string) => {
    console.log('storeRemoteManagementEndpoint', remoteManagementEndpoint);
    localStorage.setItem(LS_REMOTE_MANAGEMENT_ENDPOINT, remoteManagementEndpoint);
};

export const getStudioEndpoint = () => {
    let studioParam = new URLSearchParams(window.location.search).get('studio')
    let envParam = new URLSearchParams(window.location.search).get('env')
    let localStorageParam = localStorage.getItem(LS_STUDIO_ENDPOINT)
    if (studioParam) {
        return studioParam;
    } else if (envParam) {
        return "http://studio." + envParam + ".test.edgeimpulse.com"
    } else if (localStorageParam && localStorageParam.indexOf('wss://') === -1) {
        return localStorageParam
    } else {
        if (window.location.host === 'smartphone.acc2.edgeimpulse.com') {
            return STUDIO_ENDPOINT.replace('edgeimpulse.com', 'acc2.edgeimpulse.com')
        } else {
            return STUDIO_ENDPOINT
        }
    }
}

export const storeStudioEndpoint = (studioEndpoint: string) => {
    console.log('storeStudioEndpoint', studioEndpoint);
    localStorage.setItem(LS_STUDIO_ENDPOINT, studioEndpoint);
};