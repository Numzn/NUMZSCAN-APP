import jsQR from "jsqr";

export interface CameraReader {
  stop(): void;
}

// Reads QR codes from the device camera. Throws if there is no camera or permission is refused; the caller then
// shows the manual entry instead. onCode is called with the decoded text, which may repeat while a code is in view.
export async function startCameraReader(video: HTMLVideoElement, onCode: (text: string) => void): Promise<CameraReader> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera not available");
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  video.srcObject = stream;
  await video.play();

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const timer = window.setInterval(() => {
    if (!context || video.readyState < video.HAVE_ENOUGH_DATA || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" });
    if (code) onCode(code.data);
  }, 200);

  return {
    stop() {
      window.clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    },
  };
}
