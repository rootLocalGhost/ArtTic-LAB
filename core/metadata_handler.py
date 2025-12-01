# core/metadata_handler.py
import json
import hashlib
import base64
from datetime import datetime
from PIL import Image
from PIL.PngImagePlugin import PngInfo
import os


class MetadataHandler:
    def __init__(self):
        pass

    def create_metadata(
        self,
        prompt,
        negative_prompt,
        model_name,
        seed,
        width,
        height,
        steps,
        cfg_scale,
        lora_info=None,
    ):
        """Create metadata for an image"""
        metadata = {
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "model_name": model_name,
            "seed": seed,
            "width": width,
            "height": height,
            "steps": steps,
            "cfg_scale": cfg_scale,
            "timestamp_generation": datetime.utcnow().isoformat() + "Z",
            "timestamp_modification": datetime.utcnow().isoformat()
            + "Z",  # Will be updated when modified
            "arttic_lab_version": "3.1.0",  # Current version
        }

        if lora_info:
            metadata["lora_info"] = lora_info

        # Create a hash of the metadata to ensure integrity
        metadata_str = json.dumps(metadata, sort_keys=True)
        metadata["hash"] = hashlib.sha256(metadata_str.encode()).hexdigest()

        return metadata

    def embed_metadata_to_image(self, image_path, metadata):
        """Embed metadata to an image file"""
        try:
            # Open the image
            image = Image.open(image_path)

            # Create PngInfo object to store metadata
            pnginfo = PngInfo()

            # Add our metadata as a JSON string
            metadata_json = json.dumps(metadata)
            pnginfo.add_text("parameters", metadata_json)

            # Save image with metadata
            image.save(image_path, pnginfo=pnginfo, format="PNG")

            return True
        except Exception as e:
            print(f"Error embedding metadata: {e}")
            return False

    def extract_metadata_from_image(self, image_path):
        """Extract metadata from an image file"""
        try:
            image = Image.open(image_path)

            # Check for our metadata in the image
            if hasattr(image, "text") and "parameters" in image.text:
                metadata_json = image.text["parameters"]
                metadata = json.loads(metadata_json)

                # Verify the hash to ensure metadata integrity
                original_hash = metadata.get("hash")
                if original_hash:
                    # Create a copy without the hash for verification
                    metadata_copy = metadata.copy()
                    del metadata_copy["hash"]
                    metadata_str = json.dumps(metadata_copy, sort_keys=True)
                    calculated_hash = hashlib.sha256(metadata_str.encode()).hexdigest()

                    if original_hash != calculated_hash:
                        print(
                            "Warning: Metadata hash mismatch - metadata may have been tampered with"
                        )
                        return None

                return metadata
            else:
                return None
        except Exception as e:
            print(f"Error extracting metadata: {e}")
            return None

    def update_modification_timestamp(self, image_path):
        """Update the modification timestamp in the metadata"""
        try:
            # Extract current metadata
            current_metadata = self.extract_metadata_from_image(image_path)
            if current_metadata:
                # Update the modification timestamp
                current_metadata["timestamp_modification"] = (
                    datetime.utcnow().isoformat() + "Z"
                )

                # Recalculate the hash with the new timestamp
                metadata_copy = current_metadata.copy()
                del metadata_copy["hash"]
                metadata_str = json.dumps(metadata_copy, sort_keys=True)
                current_metadata["hash"] = hashlib.sha256(
                    metadata_str.encode()
                ).hexdigest()

                # Embed the updated metadata
                return self.embed_metadata_to_image(image_path, current_metadata)

            return False
        except Exception as e:
            print(f"Error updating modification timestamp: {e}")
            return False


# Create a global instance
metadata_handler = MetadataHandler()
