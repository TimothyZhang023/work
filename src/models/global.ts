import { history, useModel } from "@umijs/max";
import { useCallback } from "react";

type InitialState = {
  currentUser?: API.CurrentUser | null;
};

type InitialStateModel = {
  initialState?: InitialState;
  setInitialState: (
    initialState:
      | InitialState
      | undefined
      | ((state: InitialState | undefined) => InitialState | undefined)
  ) => Promise<void>;
};

type GlobalModel = {
  currentUser: API.CurrentUser | null;
  isLoggedIn: boolean;
  login: (user: API.CurrentUser, token: string) => Promise<void>;
  logout: () => Promise<void>;
};

export default (): GlobalModel => {
  const { initialState, setInitialState } =
    useModel("@@initialState", (state) => state) as InitialStateModel;

  // Derive state from initialState to ensure sync
  // app.tsx handles the initial fetch of currentUser
  const currentUser = initialState?.currentUser || null;
  const isLoggedIn = !!currentUser;

  const login = useCallback(
    async (user: API.CurrentUser, token: string) => {
      localStorage.setItem("token", token);
      // Update Umi's initialState
      await setInitialState((state) => ({ ...state, currentUser: user }));
      history.push("/chat");
    },
    [setInitialState]
  );

  const logout = useCallback(async () => {
    localStorage.removeItem("token");
    await setInitialState((state) => ({ ...state, currentUser: undefined }));
    history.push("/login");
  }, [setInitialState]);

  return {
    currentUser,
    isLoggedIn,
    login,
    logout,
  };
};
