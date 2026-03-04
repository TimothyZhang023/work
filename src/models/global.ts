import { history, useModel } from "@umijs/max";
import { useCallback } from "react";

export default () => {
  const { initialState, setInitialState } = useModel("@@initialState");

  // Derive state from initialState to ensure sync
  // app.tsx handles the initial fetch of currentUser
  const currentUser = initialState?.currentUser || null;
  const isLoggedIn = !!currentUser;

  const login = useCallback(
    async (user: API.CurrentUser, token: string) => {
      localStorage.setItem("token", token);
      // Update Umi's initialState
      await setInitialState((s) => ({ ...s, currentUser: user }));
      history.push("/chat");
    },
    [setInitialState]
  );

  const logout = useCallback(async () => {
    localStorage.removeItem("token");
    await setInitialState((s) => ({ ...s, currentUser: undefined }));
    history.push("/login");
  }, [setInitialState]);

  return {
    currentUser,
    isLoggedIn,
    login,
    logout,
  };
};
