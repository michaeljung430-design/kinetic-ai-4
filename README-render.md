# Movement Sensor Relay on Render

This small server pairs two copies of the movement app during a trial:

- **Camera station:** open the app on a laptop or tablet. It can use the camera to show the person.
- **Wearable sensor:** open the copied sensor link on the phone attached at L5. It sends accelerometer samples to the camera station.

## Deploy the relay

1. Place `relay-server.js`, `package.json`, and `render.yaml` at the top level of the GitHub repository that you connect to Render. They may coexist with the GitHub Pages HTML files.
2. In Render, select **New +** → **Web Service**, connect that GitHub repository, and deploy it as a Node service. If Render does not read the `render.yaml` file automatically, use build command `npm install` and start command `npm start`.
3. When the service is live, copy its address and change `https://` to `wss://`. For example: `https://movement-sensor-relay.onrender.com` becomes `wss://movement-sensor-relay.onrender.com`.

## Use it

1. Open the GitHub Pages app on the laptop/tablet. In **Two-device pairing**, paste the `wss://` relay address and choose **Connect camera station**.
2. Choose **Copy L5 sensor link**, then open that copied link in Safari or Chrome on the L5-mounted phone.
3. On the L5 phone, paste the same relay address if it is not already filled in, choose **Connect L5 sensor**, then choose **Enable motion sensor** and approve the permission prompt.
4. Back on the camera station, start a trial. The 30-second timer controls both devices. Results and CSV use the L5 phone's samples.

## Important demo limits

This relay is for a prototype, not clinical deployment. The short session code prevents accidental cross-pairing but is not authentication. Do not enter patient-identifying information or use it for clinical records without access control, a privacy/security review, validation, and appropriate data governance.
