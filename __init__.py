WEB_DIRECTORY = "./web"

class ComfyGameBoyPlayer:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "run"
    CATEGORY = "WAS/Play"

    def run(self):
        return ()


NODE_CLASS_MAPPINGS = {
    "ComfyGameBoyPlayer": ComfyGameBoyPlayer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ComfyGameBoyPlayer": "CGB Player",
}
