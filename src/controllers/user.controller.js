import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import {ApiResponse} from "../utils/ApiResponse.js"
import jwt from 'jsonwebtoken'

// const registerUser = asyncHandler(async(req,res)=>{
//     res.status(200).json({
//         message:"Ok"
//     })
// })

const generateAccessAndRefreshTokens = async(userId)=>{
  try {
    const user = await User.findById(userId);
    console.log("user",user);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;

    await user.save({validateBeforeSave:false});

    return {accessToken,refreshToken};
  }
   catch (error) {
    throw new ApiError(500,"Something went wrong while generating refresh and access token");
  }
}

const registerUser = asyncHandler(async (req, res) => {
  //get user details from frontend
  //validation - not empty
  //check if user already exists : username,email
  //check for image , check for avatar
  //upload them to cloudinary , avatar
  //create user object - create entry in db
  //remove password and refresh token field from response
  //check for user creation
  // return res

  const { fullName, email, username, password } = req.body;
  console.log("Email : ",fullName, email, username, password);
  console.log(req.body);

  // if(fullName===""){
  //     throw new ApiError(400,"all fields are required")
  // }

  if ([fullName, email, username, password].some((field) => field?.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }
  

  const existedUser =await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "user with email or username already exists");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;

  console.log("files",req.files);

  console.log("local : ",avatarLocalPath)

  // const coverImageLocalPath = req.files?.coverImage[0]?.path;

  let coverImageLocalPath ;
  if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length>0){
    coverImageLocalPath = req.files.coverImage[0].path;
  }


  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }


  //uploaded to cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);

  const coverImage =  await uploadOnCloudinary(coverImageLocalPath);

  console.log("cloudinary avatar : " , avatar);
  //check avatar
  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  //entry to database
  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  //whether user created or not
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"                            //to remove them
  )

  if(!createdUser){
    throw new ApiError(500,"Something went wrong while registering the user");
  }

  //retrun response
  return res.status(201).json(
    new ApiResponse(200,createdUser,"user registered successfully")
  )
});



const loginUser = asyncHandler(async (req, res) =>{
  // req body -> data
  // username or email
  //find the user
  //password check
  //access and referesh token
  //send cookie

  const {email, username, password} = req.body
  console.log(email);

  if (!username && !email) {
      throw new ApiError(400, "username or email is required")
  }
  
  // Here is an alternative of above code based on logic discussed in video:
  // if (!(username || email)) {
  //     throw new ApiError(400, "username or email is required")
      
  // }

  const user = await User.findOne({
      $or: [{username}, {email}]
  })

  if (!user) {
      throw new ApiError(404, "User does not exist")
  }

 const isPasswordValid = await user.isPasswordCorrect(password)

 if (!isPasswordValid) {
  throw new ApiError(401, "Invalid user credentials")
  }

 const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

  const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

  const options = {
      httpOnly: true,
      secure: true
  }

  return res
  .status(200)
  .cookie("accessToken", accessToken, options)
  .cookie("refreshToken", refreshToken, options)
  .json(
      new ApiResponse(
          200, 
          {
              user: loggedInUser, accessToken, refreshToken
          },
          "User logged In Successfully"
      )
  )

})

const logoutUser = asyncHandler(async(req,res)=>{
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken : undefined,
      }
    },
    {
      new:true,
    }
  )

  const options = {
    httpOnly : true,
    secure : true,
  }

  return res.status(200).clearCookie("accessToken",options).clearCookie("refreshToken",options)
            .json(new ApiResponse(200,{},"user logged out"));
})

const refreshAccessToken = asyncHandler(async(req,res)=>{
  const incomingRefreshToken = req.cookies.refreshToken ||req.body.refreshToken
  
  if(!incomingRefreshToken){
    throw new ApiError(401,"unathorized request");
  }

  try {
    const decodedToken = jwt.verify(
        incomingRefreshToken,
        process.env.REFRESH_TOKEN_SECRET
    )

    const user = await User.findById(decodedToken?._id)

    if (!user) {
        throw new ApiError(401, "Invalid refresh token")
    }

    if (incomingRefreshToken !== user?.refreshToken) {
        throw new ApiError(401, "Refresh token is expired or used")
        
    }

    const options = {
        httpOnly: true,
        secure: true
    }

    const {accessToken, newRefreshToken} = await generateAccessAndRefereshTokens(user._id)

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", newRefreshToken, options)
    .json(
        new ApiResponse(
            200, 
            {accessToken, refreshToken: newRefreshToken},
            "Access token refreshed"
        )
    )
} catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token")
}


  
})

export { registerUser,loginUser ,logoutUser,refreshAccessToken};
