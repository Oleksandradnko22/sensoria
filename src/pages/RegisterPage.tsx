import { useState } from "react";
import funnelStore
from "../store/funnelStore";

type Props = {
  stateTitle: string;
  recommendationTitle: string;

  onContinue: () => void;
};

export default function RegisterPage({
  stateTitle,
  recommendationTitle,
  onContinue,
}: Props) {
  
  const [name, setName] =
  useState("");

const [email, setEmail] =
  useState("");

const [password, setPassword] =
  useState("");

  const canContinue =
  name.trim().length > 1 &&
  email.trim().length > 0 &&
  password.trim().length >= 6;

  return (
    <div
      className="
        min-h-screen
        px-6
        py-20

        flex
        items-center
        justify-center
      "
    >
      <div className="max-w-2xl w-full">

        {/* SAVE PLAN */}

        <div
          className="
            rounded-[32px]

            bg-white/10
            backdrop-blur-2xl

            border border-white/20

            p-10

            text-white
          "
        >
          <h1
            className="
              text-4xl
              font-bold
              mb-5
            "
          >
            Збережіть свій персональний план
          </h1>

          <p
            className="
              text-white/75
              leading-relaxed
              mb-8
            "
          >
            Ваш результат буде збережено.
            Ви зможете повернутися до
            рекомендацій та відстежувати
            свій прогрес у будь-який час.
          </p>

          <div className="space-y-5">

            <input
  type="text"
  placeholder="Ім'я"

  value={name}

  onChange={(e) =>
    setName(
      e.target.value
    )
  }

  className="
    w-full

    px-5
    py-4

    rounded-2xl

    bg-white/5
    border border-white/15

    placeholder-white/40

    focus:outline-none
    focus:border-white/40
  "
/>

<input
  type="email"
  value={email}
  onChange={(e) =>
    setEmail(e.target.value)
  }
  placeholder="Email"
  className="
    w-full
    px-6
    py-5
    rounded-2xl
    bg-white/10
    border border-white/20
    text-white
    placeholder:text-white/40
  "
/>

            <input
              type="password"
              placeholder="Пароль"

              value={password}

              onChange={(e) =>
                setPassword(
                  e.target.value
                )
              }

              className="
                w-full

                px-5
                py-4

                rounded-2xl

                bg-white/5
                border border-white/15

                placeholder-white/40

                focus:outline-none
                focus:border-white/40
              "
            />

          </div>

          <div
            className="
              mt-8
              mb-8

              text-sm
              text-white/60
            "
          >
            Після збереження ви отримаєте
            персональну рекомендацію та
            зможете почати роботу над своїм
            станом.
          </div>

          <button
            disabled={!canContinue}

            onClick={() => {

  funnelStore.setUser({
    name,
    email,
    password,
  });

  onContinue();
}}

            className={`
              w-full

              py-4

              rounded-2xl

              font-semibold
              text-lg

              transition

              ${
                canContinue
                  ? `
                    bg-white
                    text-black
                    hover:scale-[1.02]
                  `
                  : `
                  bg-white/10
                    text-white/40
                    cursor-not-allowed
                  `
              }
            `}
          >
            Зберегти результат
          </button>

          <div
            className="
              mt-6
              text-center
              text-sm
              text-white/60
            "
          >
            Вже є акаунт?{" "}
            <button
              className="
                text-white
                hover:underline
              "
            >
              Увійти
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}