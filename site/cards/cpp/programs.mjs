// The C and C++ programs the card offers. Each is compiled by Clang in
// WebAssembly and run with WASI in the sandbox runner, exactly like code typed
// by hand. C++ is built with -fno-exceptions, so none of these throw.

export const SCRATCHPAD_DEFAULT = `#include <algorithm>
#include <iostream>
#include <map>
#include <string>
#include <vector>

int main() {
    std::cout << "Hello from C++, compiled in your browser!\\n";

    std::vector<int> numbers{42, 7, 19, 3, 88};
    std::ranges::sort(numbers);
    for (int n : numbers) std::cout << n << ' ';
    std::cout << '\\n';

    std::map<std::string, int> letters;
    for (char c : std::string{"webassembly"}) letters[std::string{c}]++;
    for (const auto& [letter, count] : letters) {
        if (count > 1) std::cout << letter << " appears " << count << " times\\n";
    }
}
`;

export const SCRATCHPAD_DEFAULT_C = `#include <stdio.h>

int main(void) {
    printf("Hello from C, compiled in your browser!\\n");

    int squares[5];
    for (int i = 0; i < 5; i++) squares[i] = (i + 1) * (i + 1);
    for (int i = 0; i < 5; i++) printf("%d ", squares[i]);
    printf("\\n");
    return 0;
}
`;

export const EXPERIMENTS = [
  {
    id: "templates",
    title: "Templates and constexpr",
    blurb: "A factorial computed at compile time, a variadic sum, and ranges over a vector of structs.",
    options: { dialect: "cpp" },
    source: `#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

constexpr long factorial(int n) { return n <= 1 ? 1 : n * factorial(n - 1); }
static_assert(factorial(10) == 3628800);

template <typename... Ts>
auto sum(Ts... values) { return (values + ...); }

struct Planet {
    std::string name;
    double moons;
};

int main() {
    std::cout << "10! = " << factorial(10) << " (checked at compile time)\\n";
    std::cout << "sum(1, 2.5, 3) = " << sum(1, 2.5, 3) << '\\n';

    std::vector<Planet> planets{{"Mars", 2}, {"Earth", 1}, {"Jupiter", 95}, {"Venus", 0}};
    std::ranges::sort(planets, {}, &Planet::moons);
    for (const auto& p : planets) std::cout << p.name << ": " << p.moons << " moons\\n";
}
`,
  },
  {
    id: "structs",
    title: "Structs and pointers",
    blurb: "A singly linked list in plain C: malloc, pointer walking, reversal in place, and free.",
    options: { dialect: "c" },
    source: `#include <stdio.h>
#include <stdlib.h>

struct node {
    int value;
    struct node *next;
};

static struct node *push(struct node *head, int value) {
    struct node *n = malloc(sizeof *n);
    n->value = value;
    n->next = head;
    return n;
}

static struct node *reverse(struct node *head) {
    struct node *previous = NULL;
    while (head) {
        struct node *next = head->next;
        head->next = previous;
        previous = head;
        head = next;
    }
    return previous;
}

static void print(const char *label, const struct node *n) {
    printf("%s:", label);
    for (; n; n = n->next) printf(" %d", n->value);
    printf("\\n");
}

int main(void) {
    struct node *list = NULL;
    for (int i = 1; i <= 5; i++) list = push(list, i * 10);
    print("built", list);
    list = reverse(list);
    print("reversed", list);
    while (list) {
        struct node *next = list->next;
        free(list);
        list = next;
    }
    printf("freed every node\\n");
    return 0;
}
`,
  },
];

export const PROBE_OPTIONS = { dialect: "cpp" };

export const PROBE_SOURCE = `#include <chrono>
#include <cstdio>

int main() {
    std::printf("Compiler: %s\\n", __clang_version__);
    std::printf("C++ standard: %ld\\n", static_cast<long>(__cplusplus));
    std::printf("Pointer size: %zu bytes, long: %zu bytes\\n", sizeof(void*), sizeof(long));
#ifdef __wasm32__
    std::printf("Target: wasm32 (WASI)\\n");
#endif
    auto started = std::chrono::steady_clock::now();
    volatile long long sum = 0;
    for (long long i = 0; i < 10000000; i++) sum = sum + i;
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - started).count();
    std::printf("10M-iteration loop: %lld ms (sum %lld)\\n", static_cast<long long>(ms), static_cast<long long>(sum));
}
`;
