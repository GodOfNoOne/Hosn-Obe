import { useEffect, useState } from "react";

import { socket } from "./socket.js";

/** Latest `room:error` from the server, auto-cleared after a few seconds. */
export function useServerError(): string | null {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onError({ message }: { message: string }) {
      setError(message);
      clearTimeout(timer);
      timer = setTimeout(() => setError(null), 4000);
    }
    socket.on("room:error", onError);
    return () => {
      socket.off("room:error", onError);
      clearTimeout(timer);
    };
  }, []);

  return error;
}
