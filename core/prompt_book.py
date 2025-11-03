import toml
import os
from typing import List, Dict


class PromptBook:
    def __init__(self, prompts_file: str = "prompts.toml"):
        self.prompts_file = prompts_file
        self.ensure_prompts_file_exists()

    def ensure_prompts_file_exists(self):
        if not os.path.exists(self.prompts_file):
            default_prompts = {
                "default_prompts": [
                    {
                        "title": "Ocean Spirit",
                        "prompt": "fantasy portrait of an Ocean Spirit, mystical woman with flowing hair like seafoam green and celadon waves, watercolor art, cool color palette of mint green and dark brunswick green, luminous eyes, elegant posture, magical and calming aura, fine art style, detailed face, soft-focus lighting, painterly textures",
                        "negative_prompt": "ugly, deformed, blurry, noisy, saturated colors, warm colors",
                    },
                    {
                        "title": "Cyberpunk Cityscape",
                        "prompt": "Cyberpunk cityscape at night, neon lights reflecting on wet streets, towering skyscrapers, flying vehicles, futuristic architecture, vibrant colors, cinematic lighting",
                        "negative_prompt": "outdated, rural, daytime, dull colors",
                    },
                    {
                        "title": "Ethereal Landscape",
                        "prompt": "Ethereal landscape with floating islands, waterfalls cascading into the void, soft pastel colors, dreamlike atmosphere, fantasy environment, highly detailed, 8k resolution",
                        "negative_prompt": "realistic, ordinary, dark, muddy colors",
                    },
                    {
                        "title": "Steampunk Inventor",
                        "prompt": "Steampunk inventor in his workshop, brass gears and cogs everywhere, vintage machinery, goggles, leather apron, warm lighting, detailed character design, golden hour",
                        "negative_prompt": "modern technology, plastic materials, digital interface",
                    },
                ]
            }
            try:
                with open(self.prompts_file, "w", encoding="utf-8") as f:
                    toml.dump(default_prompts, f)
            except Exception as e:
                print(f"Error creating default prompts file: {e}")

    def get_all_prompts(self) -> List[Dict]:
        try:
            data = toml.load(self.prompts_file)
            return data.get("default_prompts", [])
        except Exception as e:
            print(f"Error loading prompts: {e}")
            return []

    def add_prompt(self, title: str, prompt: str, negative_prompt: str = "") -> bool:
        try:
            data = toml.load(self.prompts_file)
            prompts = data.get("default_prompts", [])

            for p in prompts:
                if p.get("title") == title:
                    return False

            prompts.append(
                {
                    "title": title,
                    "prompt": prompt,
                    "negative_prompt": negative_prompt,
                    "custom": True,
                }
            )
            data["default_prompts"] = prompts

            with open(self.prompts_file, "w", encoding="utf-8") as f:
                toml.dump(data, f)
            return True
        except Exception as e:
            print(f"Error adding prompt: {e}")
            return False

    def update_prompt(
        self, old_title: str, new_title: str, prompt: str, negative_prompt: str
    ) -> bool:
        try:
            data = toml.load(self.prompts_file)
            prompts = data.get("default_prompts", [])

            if old_title != new_title:
                for p in prompts:
                    if p.get("title") == new_title:
                        return False

            prompt_found = False
            for p in prompts:
                if p.get("title") == old_title:
                    p["title"] = new_title
                    p["prompt"] = prompt
                    p["negative_prompt"] = negative_prompt
                    prompt_found = True
                    break

            if not prompt_found:
                return False

            data["default_prompts"] = prompts
            with open(self.prompts_file, "w", encoding="utf-8") as f:
                toml.dump(data, f)
            return True
        except Exception as e:
            print(f"Error updating prompt: {e}")
            return False

    def delete_prompt(self, title: str) -> bool:
        try:
            data = toml.load(self.prompts_file)

            prompts = data.get("default_prompts", [])
            prompts_to_keep = [p for p in prompts if p.get("title") != title]

            if len(prompts) == len(prompts_to_keep):
                return False

            data["default_prompts"] = prompts_to_keep
            with open(self.prompts_file, "w", encoding="utf-8") as f:
                toml.dump(data, f)
            return True
        except Exception as e:
            print(f"Error deleting prompt: {e}")
            return False


prompt_book = PromptBook()
