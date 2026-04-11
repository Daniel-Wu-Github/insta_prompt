# V1 Testing Notes

## Extension Popup In WSL

WXT can build the extension dev bundle, but when the repo is running in WSL it will not open a browser automatically.

To open the popup manually:

1. Run `cd extension && npm run dev`.
2. Open Chrome or Edge on the host system.
3. Go to `chrome://extensions`.
4. Turn on Developer mode.
5. Click Load unpacked.
6. Select the built extension folder: `extension/.output/chrome-mv3-dev`.
7. Pin the PromptCompiler extension if needed, then click its toolbar icon to open the popup.

Do not use `http://localhost:3001` as the popup URL. That address is the WXT dev server, not the popup itself.

## Step 0 Bind Stream Caveat

The bind stream currently splits on words and preserves trailing spaces by design in the stub. That is fine for Step 0, but it is not final production formatting.
