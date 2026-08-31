import mediasoup from 'mediasoup';
(async () => {
    try {
        console.log('creating worker...');
        const worker = await mediasoup.createWorker({ logLevel: 'warn', rtcMinPort: 2000, rtcMaxPort: 3000 });
        console.log('worker created with pid', worker.pid);
        worker.close();
    } catch (e) {
        console.error('error', e);
    }
})();
