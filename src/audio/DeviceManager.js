export class DeviceManager {
  constructor() { this.stream = null; this.generation = 0; }

  async requestPermission() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach(track => track.stop());
  }

  async listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter(device => device.kind === 'audioinput'),
      outputs: devices.filter(device => device.kind === 'audiooutput')
    };
  }

  async openInput(deviceId) {
    this.closeInput();
    const generation = this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false
      }, video: false
    });
    if (generation !== this.generation) {
      stream.getTracks().forEach(track => track.stop());
      return null;
    }
    this.stream = stream;
    return stream;
  }

  closeInput() {
    ++this.generation;
    if (!this.stream) return;
    this.stream.getTracks().forEach(track => track.stop());
    this.stream = null;
  }
}
