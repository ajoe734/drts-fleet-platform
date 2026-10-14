"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_T as T } from "../../lib/demo/translations";
import { startDemo } from "../../lib/demo/store";
import { AuthScreen, AuthAlert, P5Btn, P5Card } from "../../components/auth/ui";

export default function DemoPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <AuthScreen title={T.title} entry>
      <P5Card title={T.journey}>
        <p>{T.introduction}</p>
        <p>{T.login}</p>
        <p>{T.progression}</p>
        <p>{T.persistence}</p>
      </P5Card>
      {error && <AuthAlert>{error}</AuthAlert>}
      <P5Btn
        kind="primary"
        onClick={() => {
          try {
            startDemo();
            router.push("/login");
          } catch {
            setError(T.storageError);
          }
        }}
      >
        {T.start}
      </P5Btn>
    </AuthScreen>
  );
}
