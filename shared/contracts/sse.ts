export type StreamTokenEvent = {
  type: "token";
  data: string;
};

export type StreamDoneEvent = {
  type: "done";
};

export type StreamErrorEvent = {
  type: "error";
  message: string;
};

export type StreamEvent = StreamTokenEvent | StreamDoneEvent | StreamErrorEvent;
