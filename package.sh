source_dir="dist"

# Create a temporary directory to store the tar file
temp_dir=$(mktemp -d)

find "$source_dir" -type f -name "*.map" -exec tar -rf "$temp_dir/archive.tar" {} +

# Tar the entire directory structure
tar -cf "$temp_dir/ecprt-livekit-client-sdk-js-${VERSION}.tar.gz" "$source_dir" && echo "Added directory: $source_dir"

# Move the tar file to the desired location
mv "$temp_dir/ecprt-livekit-client-sdk-js-${VERSION}.tar.gz" "ecprt-livekit-client-sdk-js-${VERSION}.tar.gz"

# Clean up the temporary directory
rm -r "$temp_dir"

echo "Tar file created successfully."
