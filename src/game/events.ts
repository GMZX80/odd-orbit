type Handler<T> = (payload: T) => void;

class GameEvents {
  private readonly target = new EventTarget();

  on<T>(type: string, handler: Handler<T>) {
    const listener = (event: Event) => {
      handler((event as CustomEvent<T>).detail);
    };
    this.target.addEventListener(type, listener);
    return () => this.target.removeEventListener(type, listener);
  }

  emit<T>(type: string, payload: T) {
    this.target.dispatchEvent(new CustomEvent(type, { detail: payload }));
  }
}

export const gameEvents = new GameEvents();
